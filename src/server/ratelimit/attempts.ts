import 'server-only'
import type { Pool, PoolClient } from 'pg'
import { getPool } from '@/server/db/pool'
import { consume, liftLock, lockRemaining, release, setLock } from '@/server/ratelimit/consume'
import type { AttemptGuard } from '@/server/ratelimit/limits'

/** An attempt that may go ahead (what a right answer gives back), or the seconds until one may. */
export type Claim =
  | { ok: true; count: number; windowStart: Date; lockStart: string | null }
  | { ok: false; retryAfterSeconds: number }

export type Granted = Extract<Claim, { ok: true }>

/**
 * Counts an attempt before it is checked, one claim at a time per subject. A burst of requests therefore cannot all
 * pass the lock check before the first failure is counted: the claim that reaches the limit sets the lock at once, and
 * the claims after it are refused. A wrong answer leaves the count and that lock standing; a right one gives both back.
 */
export async function claimAttempt(guard: AttemptGuard, subject: string, pool: Pool = getPool()): Promise<Claim> {
  const client = await pool.connect()
  let broken = false

  try {
    await client.query('begin')
    // Held until the commit: the claims of one subject run one after another, each seeing the lock the last one set.
    await client.query('select pg_advisory_xact_lock(hashtext($1), hashtext($2))', [guard.limit.purpose, subject])

    const claim = await claimInTransaction(client, guard, subject)

    await client.query('commit')

    return claim
  } catch (error) {
    await client.query('rollback').catch(() => { broken = true })
    throw error
  } finally {
    client.release(broken)
  }
}

async function claimInTransaction(client: PoolClient, guard: AttemptGuard, subject: string): Promise<Claim> {
  const remaining = await lockRemaining(guard.lock, subject, client)

  if (remaining > 0) return { ok: false, retryAfterSeconds: remaining }

  const counted = await consume(guard.limit, subject, client)
  const seconds = guard.lockSeconds(counted.count)
  const lockStart = seconds > 0 ? await setLock(guard.lock, subject, seconds, client) : null

  return { ok: true, count: counted.count, windowStart: counted.windowStart, lockStart }
}

/** A right answer: the attempt's slot is given back, and the lock its claim set, if any, is lifted. */
export async function giveBack(guard: AttemptGuard, subject: string, claim: Granted, pool: Pool = getPool()): Promise<void> {
  await release(guard.limit, subject, claim.windowStart, pool)
  if (claim.lockStart) await liftLock(guard.lock, subject, claim.lockStart, pool)
}
