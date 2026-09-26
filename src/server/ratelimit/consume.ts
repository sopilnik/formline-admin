import 'server-only'
import type { Pool } from 'pg'
import { getPool } from '@/server/db/pool'
import type { Limit } from '@/server/ratelimit/limits'

export type Verdict = { allowed: boolean; count: number; retryAfterSeconds: number }

// fa.rate_limits is global (no workspace). Counter rows are keyed by purpose,
// subject and the start of a fixed window; a lock row's window_start is the
// moment of the lock. Every statement runs on its own pooled connection, outside
// any caller transaction, so a counted failure survives the rollback of the
// attempt it counts. The daily job purges old rows (stage 6).

/** Counts one attempt; allowed while the count, this attempt included, is within the limit. */
export async function consume(limit: Limit, subject: string, pool: Pool = getPool()): Promise<Verdict> {
  const { rows } = await pool.query<{ count: number; retry: number }>(
    `insert into fa.rate_limits as r (purpose, subject, window_start, count)
     values ($1, $2, to_timestamp((floor(extract(epoch from now()) / $3::int) * $3::int)::float8), 1)
     on conflict (purpose, subject, window_start) do update set count = r.count + 1
     returning r.count, ceil(extract(epoch from r.window_start + make_interval(secs => $3::int) - now()))::int as retry`,
    [limit.purpose, subject, limit.windowSeconds])
  const row = rows[0]!
  return { allowed: row.count <= limit.limit, count: row.count, retryAfterSeconds: Math.max(row.retry, 1) }
}

/** Reads the current window without counting; allowed while one more attempt would fit. */
export async function peek(limit: Limit, subject: string, pool: Pool = getPool()): Promise<Verdict> {
  const { rows } = await pool.query<{ count: number | null; retry: number }>(
    `with w as (select to_timestamp((floor(extract(epoch from now()) / $3::int) * $3::int)::float8) as start)
     select (select r.count from fa.rate_limits r, w where r.purpose = $1 and r.subject = $2 and r.window_start = w.start) as count,
            ceil(extract(epoch from w.start + make_interval(secs => $3::int) - now()))::int as retry
       from w`,
    [limit.purpose, subject, limit.windowSeconds])
  const count = rows[0]?.count ?? 0
  return { allowed: count < limit.limit, count, retryAfterSeconds: Math.max(rows[0]?.retry ?? 1, 1) }
}

/** Starts a lock that holds for a fixed time from now (the password and second-factor lockouts). */
export async function setLock(purpose: string, subject: string, pool: Pool = getPool()): Promise<void> {
  await pool.query(
    `insert into fa.rate_limits (purpose, subject, window_start, count) values ($1, $2, now(), 1)
     on conflict (purpose, subject, window_start) do nothing`,
    [purpose, subject])
}

/** Seconds left of the latest lock, 0 when there is none. */
export async function lockRemaining(purpose: string, subject: string, seconds: number, pool: Pool = getPool()): Promise<number> {
  const { rows } = await pool.query<{ remaining: number | null }>(
    `select ceil(extract(epoch from max(r.window_start) + make_interval(secs => $3::int) - now()))::int as remaining
       from fa.rate_limits r
      where r.purpose = $1 and r.subject = $2 and r.count > 0 and r.window_start > now() - make_interval(secs => $3::int)`,
    [purpose, subject, seconds])
  return Math.max(rows[0]?.remaining ?? 0, 0)
}

/** Clears every counter and lock of a subject (owner recovery, spec §5.8). The app role cannot delete. */
export async function clearSubject(subject: string, pool: Pool = getPool()): Promise<void> {
  await pool.query('update fa.rate_limits set count = 0 where subject = $1', [subject])
}
