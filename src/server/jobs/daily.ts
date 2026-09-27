import 'server-only'
import type { Pool } from 'pg'
import { getPool } from '@/server/db/pool'
import { log } from '@/server/log'
import { drainPendingDeletions } from '@/server/media/deletions'
import { unavailableStorage, type MediaStorage } from '@/server/media/storage'
import { cleanupExpiredSandboxes } from '@/server/sandbox/cleanup'

/** The daily job's hour, away from midnight roll-overs and Neon's own maintenance. */
export const DAILY_RUN_UTC = { hour: 3, minute: 17 } as const
const DAY_MS = 86_400_000

export type DailyReport = {
  sandboxes: number
  purged: { rateLimits: number; challenges: number; sessions: number; failedSignIns: number }
  media: { deleted: number; retried: number }
}

type PurgeRow = { purged_rate_limits: number; purged_challenges: number; purged_sessions: number; purged_failed_sign_ins: number }

/** Milliseconds from `nowMs` to the next run. */
export function msUntilNextRun(nowMs: number, at: { hour: number; minute: number } = DAILY_RUN_UTC): number {
  const next = new Date(nowMs)
  next.setUTCHours(at.hour, at.minute, 0, 0)
  if (next.getTime() <= nowMs) next.setTime(next.getTime() + DAY_MS)
  return next.getTime() - nowMs
}

/** The daily job (spec §6.5): expired sandboxes, old counters, challenges and sessions, then the storage queue. */
export async function runDailyJob(deps: { pool?: Pool; storage?: MediaStorage } = {}): Promise<DailyReport> {
  const pool = deps.pool ?? getPool()
  const sandboxes = await cleanupExpiredSandboxes(pool)
  const { rows } = await pool.query<PurgeRow>('select * from fa.purge_housekeeping()')
  const purged = rows[0]!
  const media = await drainPendingDeletions(deps.storage ?? unavailableStorage, pool)
  const report: DailyReport = {
    sandboxes,
    purged: { rateLimits: purged.purged_rate_limits, challenges: purged.purged_challenges, sessions: purged.purged_sessions, failedSignIns: purged.purged_failed_sign_ins },
    media,
  }
  log.info({ event: 'daily.done', ...report })
  return report
}

export type Timer = { after(ms: number, fn: () => void): () => void }

/** Node timers that never keep the process alive. */
export const nodeTimer: Timer = {
  after(ms, fn) {
    const handle = setTimeout(fn, ms) as unknown as { unref?: () => unknown }
    handle.unref?.()
    return () => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
  },
}

/** Arms the job for the life of the process: at the next slot, then every 24 hours. Returns a stop function. */
export function scheduleDailyJob(run: () => Promise<unknown> = runDailyJob, nowMs: number = Date.now(), timer: Timer = nodeTimer): () => void {
  let stopped = false
  let cancel: () => void = () => undefined
  const arm = (ms: number) => {
    cancel = timer.after(ms, () => {
      if (stopped) return
      run().catch(error => log.error({ event: 'daily.failed', message: error instanceof Error ? error.message : String(error) }))
      arm(DAY_MS)
    })
  }
  arm(msUntilNextRun(nowMs))
  return () => {
    stopped = true
    cancel()
  }
}
