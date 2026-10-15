import 'server-only'
import { clearTimeout, setTimeout } from 'node:timers'
import type { Pool } from 'pg'
import { DAY_MS } from '@/lib/periods'
import { stripeConfig } from '@/server/config'
import { getPool } from '@/server/db/pool'
import { log } from '@/server/log'
import { drainPendingDeletions } from '@/server/media/deletions'
import { mediaStorage, unavailableStorage, type MediaStorage } from '@/server/media/storage'
import { cleanupExpiredSandboxes } from '@/server/sandbox/cleanup'
import { pseudonymiseOldCustomers } from '@/server/stripe/personal-data'

/** The daily job's hour, away from midnight roll-overs and Neon's own maintenance. */
export const DAILY_RUN_UTC = { hour: 3, minute: 17 } as const

/** The job's steps, in the order they run; none waits for another to succeed. */
export type DailyStep = 'sandboxes' | 'purge' | 'media' | 'customers'

export type DailyReport = {
  sandboxes: number
  purged: { rateLimits: number; challenges: number; sessions: number; failedSignIns: number }
  media: { deleted: number; retried: number }
  /** Owner-workspace customers pseudonymised; none while the Stripe ingest is not configured. */
  customers: number
  /** The steps that failed this time; each is logged as `daily.step_failed` and runs again the next day. */
  failed: DailyStep[]
}

type PurgeRow = { purged_rate_limits: number; purged_challenges: number; purged_sessions: number; purged_failed_sign_ins: number }

const NOTHING_PURGED: DailyReport['purged'] = { rateLimits: 0, challenges: 0, sessions: 0, failedSignIns: 0 }

/** Milliseconds from `nowMs` to the next run. */
export function msUntilNextRun(nowMs: number, at: { hour: number; minute: number } = DAILY_RUN_UTC): number {
  const next = new Date(nowMs)

  next.setUTCHours(at.hour, at.minute, 0, 0)

  if (next.getTime() <= nowMs) {
    next.setTime(next.getTime() + DAY_MS)
  }

  return next.getTime() - nowMs
}

async function purgeHousekeeping(pool: Pool): Promise<DailyReport['purged']> {
  const { rows } = await pool.query<PurgeRow>('select * from fa.purge_housekeeping()')
  const purged = rows[0]!

  return { rateLimits: purged.purged_rate_limits, challenges: purged.purged_challenges, sessions: purged.purged_sessions, failedSignIns: purged.purged_failed_sign_ins }
}

/** Runs one step; a failure is logged with the step's name and noted in `failed`, and the job goes on with `fallback`. */
async function step<T>(
  { name, failed, fallback }: { name: DailyStep; failed: DailyStep[]; fallback: T },
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    log.error({ event: 'daily.step_failed', step: name, err: error })
    failed.push(name)

    return fallback
  }
}

/**
 * The daily job: expired sandboxes, old counters, challenges and sessions, the storage queue, then the
 * store customers due for their pseudonym. The steps are independent: one that fails never holds back the ones after it.
 */
export async function runDailyJob(deps: { pool?: Pool; storage?: MediaStorage; pseudonymKey?: string | null } = {}): Promise<DailyReport> {
  const pool = deps.pool ?? getPool()
  const failed: DailyStep[] = []

  const sandboxes = await step({ name: 'sandboxes', failed, fallback: 0 }, () => cleanupExpiredSandboxes(pool))
  const purged = await step({ name: 'purge', failed, fallback: NOTHING_PURGED }, () => purgeHousekeeping(pool))
  const media = await step({ name: 'media', failed, fallback: { deleted: 0, retried: 0 } }, () => drainPendingDeletions(deps.storage ?? mediaStorage() ?? unavailableStorage, pool))
  const customers = await step({ name: 'customers', failed, fallback: 0 }, async () => {
    const pseudonymKey = deps.pseudonymKey === undefined ? stripeConfig()?.pseudonymKey ?? null : deps.pseudonymKey

    return pseudonymKey ? pseudonymiseOldCustomers(pseudonymKey, pool) : 0
  })

  const report: DailyReport = { sandboxes, purged, media, customers, failed }

  log.info({ event: 'daily.done', ...report })

  return report
}

export type Timer = { after(ms: number, fn: () => void): () => void }

/** Node timers that never keep the process alive. */
export const nodeTimer: Timer = {
  after(ms, fn) {
    const handle = setTimeout(fn, ms)

    handle.unref()

    return () => clearTimeout(handle)
  },
}

/** Arms the job for the life of the process: at the next slot, then every 24 hours. Returns a stop function. */
export function scheduleDailyJob(run: () => Promise<unknown> = runDailyJob, nowMs: number = Date.now(), timer: Timer = nodeTimer): () => void {
  let stopped = false
  let cancel: () => void = () => undefined
  const arm = (ms: number) => {
    cancel = timer.after(ms, () => {
      if (stopped) {
        return
      }

      run().catch(error => log.error({ event: 'daily.failed', err: error }))
      arm(DAY_MS)
    })
  }

  arm(msUntilNextRun(nowMs))

  return () => {
    stopped = true
    cancel()
  }
}
