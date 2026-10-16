import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { hashToken } from '@/server/auth/tokens'
import { runDailyJob } from '@/server/jobs/daily'
import { log } from '@/server/log'
import { drainPendingDeletions } from '@/server/media/deletions'
import { MEDIA_PATH } from '@/server/media/storage'
import { cleanupExpiredSandboxes } from '@/server/sandbox/cleanup'
import { adminPool, appPool, closeAll } from './db'
import { APP_POOLED_URL } from './env'
import { asSchemaOwner, createSandbox } from './fixtures'
import { memoryStorage } from './storage'

let admin: pg.Pool
let app: pg.Pool

async function enter(): Promise<{ workspaceId: string; userId: string; sessionId: string }> {
  const { workspaceId, userId, token } = await createSandbox(app)

  return { workspaceId, userId, sessionId: hashToken(token) }
}

const exists = async (workspaceId: string) => (await admin.query('select 1 from fa.workspaces where id = $1', [workspaceId])).rowCount === 1

beforeAll(() => {
  admin = adminPool()
  app = appPool()
})

afterAll(closeAll)

describe('delete_expired_sandboxes', () => {
  it('deletes expired and idle sandboxes, queues their uploads and keeps active ones', async () => {
    const expired = await enter()
    const idle = await enter()
    const active = await enter()

    await admin.query("update fa.workspaces set expires_at = now() - interval '1 second' where id = $1", [expired.workspaceId])
    await admin.query("update fa.workspaces set last_active_at = now() - interval '2 hours 1 minute' where id = $1", [idle.workspaceId])
    await asSchemaOwner(admin, c => c.query(
      "insert into fa.images (workspace_id, storage_path, source, width, height, bytes) values ($1, 'media/expired-upload.webp', 'upload', 10, 10, 100)", [expired.workspaceId]))

    try {
      const { rows } = await app.query<{ n: number }>('select fa.delete_expired_sandboxes() as n')

      expect(rows[0]!.n).toBeGreaterThanOrEqual(2)
      expect(await exists(expired.workspaceId)).toBe(false)
      expect(await exists(idle.workspaceId)).toBe(false)
      expect(await exists(active.workspaceId)).toBe(true)
      expect((await admin.query("select 1 from fa.pending_media_deletions where storage_path = 'media/expired-upload.webp'")).rowCount).toBe(1)
    } finally {
      await admin.query("delete from fa.pending_media_deletions where storage_path = 'media/expired-upload.webp'")
      await admin.query('delete from fa.workspaces where id = $1', [active.workspaceId])
    }
  })

  it('cleanupExpiredSandboxes returns the count and never throws', async () => {
    expect(typeof await cleanupExpiredSandboxes(app)).toBe('number')

    const wrong = new URL(APP_POOLED_URL)

    wrong.password = 'wrong-password'

    const broken = new pg.Pool({ connectionString: wrong.href, max: 1 })

    try {
      expect(await cleanupExpiredSandboxes(broken)).toBe(0)
    } finally {
      await broken.end()
    }
  })
})

describe('purge_housekeeping', () => {
  it('removes old counters, challenges, expired sessions and old failed sign-ins, and nothing fresh', async () => {
    const { workspaceId, userId } = await enter()
    const fresh = `k-${randomUUID()}`
    const old = `k-${randomUUID()}`
    const hash = (s: string) => createHash('sha256').update(s).digest('hex')

    await admin.query("insert into fa.rate_limits (purpose, subject, window_start, count) values ('t', $1, now() - interval '2 days', 1), ('t', $2, now(), 1)", [old, fresh])
    await admin.query("insert into fa.used_challenges (challenge_hash, used_at) values ($1, now() - interval '2 days'), ($2, now())", [hash(old), hash(fresh)])

    await asSchemaOwner(admin, async c => {
      await c.query("insert into fa.sessions (workspace_id, id, user_id, expires_at) values ($1, $2, $3, now() - interval '1 second'), ($1, $4, $3, now() + interval '1 hour')", [workspaceId, hash(`s-${old}`), userId, hash(`s-${fresh}`)])
      await c.query("insert into fa.activity_log (workspace_id, actor_user_id, action, at) values ($1, $2, 'auth.sign_in_failed', now() - interval '91 days'), ($1, $2, 'auth.sign_in_failed', now() - interval '1 day')", [workspaceId, userId])
    })

    try {
      const { rows } = await app.query<{ purged_rate_limits: number; purged_challenges: number; purged_sessions: number; purged_failed_sign_ins: number }>('select * from fa.purge_housekeeping()')

      expect(rows[0]!.purged_rate_limits).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.purged_challenges).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.purged_sessions).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.purged_failed_sign_ins).toBeGreaterThanOrEqual(1)
      expect((await admin.query('select subject from fa.rate_limits where subject in ($1, $2)', [old, fresh])).rows).toEqual([{ subject: fresh }])
      expect((await admin.query('select 1 from fa.used_challenges where challenge_hash = $1', [hash(old)])).rowCount).toBe(0)
      expect((await admin.query('select 1 from fa.used_challenges where challenge_hash = $1', [hash(fresh)])).rowCount).toBe(1)
      expect((await admin.query('select id from fa.sessions where id in ($1, $2)', [hash(`s-${old}`), hash(`s-${fresh}`)])).rows).toEqual([{ id: hash(`s-${fresh}`) }])

      const log = await admin.query<{ n: string }>("select count(*) as n from fa.activity_log where workspace_id = $1 and action = 'auth.sign_in_failed'", [workspaceId])

      expect(Number(log.rows[0]!.n)).toBe(1)
    } finally {
      await admin.query('delete from fa.rate_limits where subject = $1', [fresh])
      await admin.query('delete from fa.used_challenges where challenge_hash = $1', [hash(fresh)])
      await admin.query('delete from fa.workspaces where id = $1', [workspaceId])
    }
  })
})

describe('drainPendingDeletions', () => {
  it('deletes what storage accepts and re-queues what it refuses with a growing delay', async () => {
    // The queue is global: a due row another file left would be drained and counted here too.
    await admin.query('delete from fa.pending_media_deletions where next_attempt_at <= now()')
    await admin.query("insert into fa.pending_media_deletions (storage_path) values ('media/ok.webp'), ('media/bad.webp'), ('media/later.webp')")
    await admin.query("update fa.pending_media_deletions set next_attempt_at = now() + interval '1 hour' where storage_path = 'media/later.webp'")

    const storage = memoryStorage(['media/ok.webp', 'media/bad.webp', 'media/later.webp'])

    storage.failing.add('media/bad.webp')

    try {
      expect(await drainPendingDeletions(storage, app)).toEqual({ deleted: 1, retried: 1 })
      expect(storage.paths.has('media/ok.webp')).toBe(false)
      expect(storage.paths.has('media/later.webp')).toBe(true)
      expect((await admin.query("select 1 from fa.pending_media_deletions where storage_path = 'media/ok.webp'")).rowCount).toBe(0)

      const first = await admin.query<{ attempts: number; minutes: number }>(
        "select attempts, extract(epoch from next_attempt_at - now())::double precision / 60 as minutes from fa.pending_media_deletions where storage_path = 'media/bad.webp'")

      expect(first.rows[0]?.attempts).toBe(1)
      expect(first.rows[0]!.minutes).toBeGreaterThan(58)
      expect(first.rows[0]!.minutes).toBeLessThanOrEqual(60)

      await admin.query("update fa.pending_media_deletions set next_attempt_at = now() where storage_path = 'media/bad.webp'")

      expect(await drainPendingDeletions(storage, app)).toEqual({ deleted: 0, retried: 1 })

      const second = await admin.query<{ attempts: number; minutes: number }>(
        "select attempts, extract(epoch from next_attempt_at - now())::double precision / 60 as minutes from fa.pending_media_deletions where storage_path = 'media/bad.webp'")

      expect(second.rows[0]?.attempts).toBe(2)
      expect(second.rows[0]!.minutes).toBeGreaterThan(118)
      expect(second.rows[0]!.minutes).toBeLessThanOrEqual(120)
    } finally {
      await admin.query("delete from fa.pending_media_deletions where storage_path in ('media/ok.webp', 'media/bad.webp', 'media/later.webp')")
    }
  })

  it('takes an upload’s small copy away with it', async () => {
    const path = `ws/${randomUUID()}/${randomUUID()}.webp`
    const thumb = path.replace(/\.webp$/, '.thumb.webp')

    await admin.query('insert into fa.pending_media_deletions (storage_path) values ($1)', [path])

    const storage = memoryStorage([path, thumb])

    try {
      await drainPendingDeletions(storage, app)

      expect([storage.paths.has(path), storage.paths.has(thumb)]).toEqual([false, false])
    } finally {
      await admin.query('delete from fa.pending_media_deletions where storage_path = $1', [path])
    }
  })

  it('deletes a queued small copy once, without looking for a copy of the copy', async () => {
    const path = `ws/${randomUUID()}/${randomUUID()}.thumb.webp`

    await admin.query('insert into fa.pending_media_deletions (storage_path) values ($1)', [path])

    // As the real storages do, this one refuses any path that is not a media path.
    const storage = memoryStorage([path])
    const remove = storage.delete.bind(storage)

    storage.delete = async target => {
      if (!MEDIA_PATH.test(target)) {
        throw new Error(`not a media path: ${target}`)
      }

      await remove(target)
    }

    try {
      await drainPendingDeletions(storage, app)

      expect(storage.paths.has(path)).toBe(false)
      expect((await admin.query('select 1 from fa.pending_media_deletions where storage_path = $1', [path])).rowCount).toBe(0)
    } finally {
      await admin.query('delete from fa.pending_media_deletions where storage_path = $1', [path])
    }
  })

  it('runDailyJob runs every part and reports what each did', async () => {
    // One due row for every part of the job.
    const expired = await enter()

    await admin.query("update fa.workspaces set expires_at = now() - interval '1 minute' where id = $1", [expired.workspaceId])

    const live = await enter()

    await admin.query("insert into fa.sessions (workspace_id, id, user_id, expires_at) values ($1, $2, $3, now() - interval '1 minute')", [live.workspaceId, hashToken(randomUUID()), live.userId])
    await admin.query("insert into fa.rate_limits (purpose, subject, window_start, count) values ('daily.test', $1, now() - interval '2 days', 1)", [randomUUID()])
    await admin.query("insert into fa.used_challenges (challenge_hash, used_at) values ($1, now() - interval '2 days')", [hashToken(randomUUID())])
    await admin.query("insert into fa.activity_log (workspace_id, action, at) values ($1, 'auth.sign_in_failed', now() - interval '91 days')", [live.workspaceId])

    const [gone, refused] = [`ws/${live.workspaceId}/${randomUUID()}.webp`, `ws/${live.workspaceId}/${randomUUID()}.webp`]

    await admin.query('insert into fa.pending_media_deletions (storage_path) values ($1), ($2)', [gone, refused])

    const storage = memoryStorage([gone, refused])

    storage.failing.add(refused)

    const owner = (await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
    const customer = (await admin.query<{ id: string }>(
      "insert into fa.customers (workspace_id, email, name, created_at) values ($1, $2, 'Old Buyer', now() - interval '31 days') returning id",
      [owner, `old.${randomUUID()}@daily.test`])).rows[0]!.id

    try {
      const report = await runDailyJob({ pool: app, storage, pseudonymKey: 'test-pseudonym-key-0123456789abcdef0123456789' })
      const counts = { sandboxes: report.sandboxes, ...report.purged, ...report.media, customers: report.customers }

      expect(Object.entries(counts).filter(([, n]) => n < 1).map(([part]) => part)).toEqual([])
      expect(report.failed).toEqual([])
    } finally {
      await admin.query('delete from fa.pending_media_deletions where storage_path = any($1::text[])', [[gone, refused]])
      await admin.query('delete from fa.customers where id = $1', [customer])
    }
  })

  it('runDailyJob goes on past a failing step and names it in the report and the log', async () => {
    const refusing = new Proxy(app, {
      get(target, key, receiver) {
        if (key !== 'query') {
          return Reflect.get(target, key, receiver)
        }

        return (text: unknown, ...rest: unknown[]) => String(text).includes('purge_housekeeping')
          ? Promise.reject(new Error('purge refused'))
          : (target.query as (...args: unknown[]) => Promise<unknown>).call(target, text, ...rest)
      },
    })
    const errors = vi.spyOn(log, 'error')

    try {
      const report = await runDailyJob({ pool: refusing, storage: memoryStorage(), pseudonymKey: 'daily-test-key' })

      expect(report.failed).toEqual(['purge'])
      expect(report.purged).toEqual({ rateLimits: 0, challenges: 0, sessions: 0, failedSignIns: 0 })
      expect(report.media).toEqual({ deleted: expect.any(Number), retried: expect.any(Number) })
      expect(report.customers).toEqual(expect.any(Number))
      expect(errors).toHaveBeenCalledWith(expect.objectContaining({ event: 'daily.step_failed', step: 'purge' }))
    } finally {
      errors.mockRestore()
    }
  })
})
