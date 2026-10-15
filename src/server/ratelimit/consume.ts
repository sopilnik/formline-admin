import 'server-only'
import type { Pool } from 'pg'
import { getPool } from '@/server/db/pool'
import type { Limit } from '@/server/ratelimit/limits'

export type Verdict = { allowed: boolean; count: number; retryAfterSeconds: number }
/** A counted attempt, with the start of the window it counted in, so it can be given back. */
export type Counted = Verdict & { windowStart: Date }

/** A pool or one of its connections: the claims of attempts.ts count inside a transaction of their own. */
export type Queryable = Pick<Pool, 'query'>

// fa.rate_limits is global (no workspace). Counter rows are keyed by purpose,
// subject and the start of a fixed window; a lock row's window_start is the
// moment of the lock. Every statement runs on its own pooled connection, or in
// the short transaction of a claim (attempts.ts), never inside a caller's
// transaction, so a counted failure survives the rollback of the attempt it
// counts. The daily job purges old rows.

/** Counts one attempt; allowed while the count, this attempt included, is within the limit. */
export async function consume(limit: Limit, subject: string, pool: Queryable = getPool()): Promise<Counted> {
  const { rows } = await pool.query<{ count: number; retry: number; window_start: Date }>(
    `insert into fa.rate_limits as r (purpose, subject, window_start, count)
     values ($1, $2, to_timestamp((floor(extract(epoch from now()) / $3::int) * $3::int)::float8), 1)
     on conflict (purpose, subject, window_start) do update set count = r.count + 1
     returning r.count, ceil(extract(epoch from r.window_start + make_interval(secs => $3::int) - now()))::int as retry, r.window_start`,
    [limit.purpose, subject, limit.windowSeconds])
  const row = rows[0]!

  return { allowed: row.count <= limit.limit, count: row.count, retryAfterSeconds: Math.max(row.retry, 1), windowStart: row.window_start }
}

/** Gives back an attempt counted in `windowStart`: the window it counted in, even when a new one has begun since. */
export async function release(
  limit: Limit,
  { subject, windowStart }: { subject: string; windowStart: Date },
  pool: Queryable = getPool(),
): Promise<void> {
  await pool.query(
    'update fa.rate_limits set count = count - 1 where purpose = $1 and subject = $2 and window_start = $3 and count > 0',
    [limit.purpose, subject, windowStart])
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

/**
 * Starts a lock that holds for `seconds` from now (the password and second-factor lockouts). A lock row keeps its start
 * in `window_start` and its length in `count`, so it lasts as long as it was set for, whatever the counters do meanwhile.
 * Answers the start as the database wrote it, to the microsecond, which names the lock for liftLock().
 */
export async function setLock(
  purpose: string,
  { subject, seconds }: { subject: string; seconds: number },
  pool: Queryable = getPool(),
): Promise<string | null> {
  const { rows } = await pool.query<{ start: string }>(
    `insert into fa.rate_limits (purpose, subject, window_start, count) values ($1, $2, clock_timestamp(), $3)
     on conflict (purpose, subject, window_start) do nothing
     returning window_start::text as start`,
    [purpose, subject, seconds])

  return rows[0]?.start ?? null
}

/** Ends the lock that started at `start` before its time (the attempt that set it turned out right). */
export async function liftLock(
  purpose: string,
  { subject, start }: { subject: string; start: string },
  pool: Queryable = getPool(),
): Promise<void> {
  await pool.query(
    'update fa.rate_limits set count = 0 where purpose = $1 and subject = $2 and window_start = $3::timestamptz',
    [purpose, subject, start])
}

/** Seconds left of the lock that ends last, 0 when none holds. */
export async function lockRemaining(purpose: string, subject: string, pool: Queryable = getPool()): Promise<number> {
  const { rows } = await pool.query<{ remaining: number | null }>(
    `select ceil(extract(epoch from max(r.window_start + make_interval(secs => r.count)) - now()))::int as remaining
       from fa.rate_limits r
      where r.purpose = $1 and r.subject = $2 and r.count > 0 and r.window_start + make_interval(secs => r.count) > now()`,
    [purpose, subject])

  return Math.max(rows[0]?.remaining ?? 0, 0)
}

/** Clears every counter and lock of a subject (owner recovery). The app role cannot delete. */
export async function clearSubject(subject: string, pool: Pool = getPool()): Promise<void> {
  await pool.query('update fa.rate_limits set count = 0 where subject = $1', [subject])
}
