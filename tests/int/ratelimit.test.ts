import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { claimAttempt, giveBack } from '@/server/ratelimit/attempts'
import { clearSubject, consume, lockRemaining, peek, release, setLock } from '@/server/ratelimit/consume'
import { roomInWindow } from '../windows'
import { adminPool, appPool, closeAll } from './db'

let admin: pg.Pool
let app: pg.Pool
const LIMIT = { purpose: 'test.limit', limit: 3, windowSeconds: 60 }
const subject = () => `test:${crypto.randomUUID()}`

beforeAll(() => {
  admin = adminPool()
  app = appPool()
})
afterAll(closeAll)

describe('fixed windows', () => {
  it('count attempts and refuse beyond the limit', async () => {
    await roomInWindow(LIMIT.windowSeconds, 10)
    const s = subject()
    const verdicts = []
    for (let i = 0; i < 4; i++) verdicts.push(await consume(LIMIT, s, app))
    expect(verdicts.map(v => v.count)).toEqual([1, 2, 3, 4])
    expect(verdicts.map(v => v.allowed)).toEqual([true, true, true, false])
    for (const v of verdicts) {
      expect(v.retryAfterSeconds).toBeGreaterThanOrEqual(1)
      expect(v.retryAfterSeconds).toBeLessThanOrEqual(60)
    }
  })

  it('peek reads without counting', async () => {
    await roomInWindow(LIMIT.windowSeconds, 10)
    const s = subject()
    expect(await peek(LIMIT, s, app)).toMatchObject({ count: 0, allowed: true })
    for (let i = 0; i < 3; i++) await consume(LIMIT, s, app)
    expect(await peek(LIMIT, s, app)).toMatchObject({ count: 3, allowed: false })
    expect((await peek(LIMIT, s, app)).count).toBe(3)
  })

  it('start again from zero in a new window', async () => {
    const s = subject()
    await admin.query("insert into fa.rate_limits (purpose, subject, window_start, count) values ($1, $2, now() - interval '5 minutes', 99)", [LIMIT.purpose, s])
    expect((await consume(LIMIT, s, app)).count).toBe(1)
  })

  it('count concurrent attempts exactly', async () => {
    await roomInWindow(LIMIT.windowSeconds, 10)
    const s = subject()
    const counts = (await Promise.all(Array.from({ length: 10 }, () => consume({ ...LIMIT, limit: 100 }, s, app)))).map(v => v.count)
    expect(counts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('locks', () => {
  it('hold for the length they were set with, from the moment they are set', async () => {
    const s = subject()
    expect(await lockRemaining('test.lock', s, app)).toBe(0)
    await setLock('test.lock', s, 900, app)
    const left = await lockRemaining('test.lock', s, app)
    expect(left).toBeGreaterThan(890)
    expect(left).toBeLessThanOrEqual(900)
  })

  it('count the lock that ends last', async () => {
    const s = subject()
    await setLock('test.lock', s, 3600, app)
    await admin.query("insert into fa.rate_limits (purpose, subject, window_start, count) values ('test.lock', $1, now() - interval '1 minute', 900)", [s])
    expect(await lockRemaining('test.lock', s, app)).toBeGreaterThan(3590)
  })

  it('run out after their length, not before', async () => {
    const s = subject()
    await admin.query("insert into fa.rate_limits (purpose, subject, window_start, count) values ('test.lock', $1, now() - interval '2 hours', 3600)", [s])
    expect(await lockRemaining('test.lock', s, app)).toBe(0)
    // Set 50 minutes ago for an hour: ten minutes are left, whatever window the clock is in now.
    const t = subject()
    await admin.query("insert into fa.rate_limits (purpose, subject, window_start, count) values ('test.lock', $1, now() - interval '50 minutes', 3600)", [t])
    const left = await lockRemaining('test.lock', t, app)
    expect(left).toBeGreaterThan(590)
    expect(left).toBeLessThanOrEqual(600)
  })

  it('clear together with the counters of their subject', async () => {
    const s = subject()
    await setLock('test.lock', s, 3600, app)
    await consume(LIMIT, s, app)
    await clearSubject(s, app)
    expect(await lockRemaining('test.lock', s, app)).toBe(0)
    expect((await peek(LIMIT, s, app)).count).toBe(0)
  })
})

describe('privileges', () => {
  it('the application role can count but never delete', async () => {
    await expect(app.query('delete from fa.rate_limits')).rejects.toThrow(/permission denied/)
  })
})

describe('claimed attempts', () => {
  const GUARD = { limit: LIMIT, lock: 'test.claim.lock', lockSeconds: (count: number) => count >= LIMIT.limit ? 600 : 0 }

  it('run one at a time per subject: a burst gets the limit, the claim that reaches it locks, the rest wait it out', async () => {
    await roomInWindow(LIMIT.windowSeconds, 10)
    const s = subject()

    const claims = await Promise.all(Array.from({ length: 12 }, () => claimAttempt(GUARD, s, app)))

    const granted = claims.filter(c => c.ok)
    expect(granted.map(c => c.count).sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect(granted.filter(c => c.lockStart !== null).map(c => c.count)).toEqual([3])
    expect(claims.filter(c => !c.ok).every(c => c.retryAfterSeconds > 590)).toBe(true)
  })

  it('give back their slot and lift the lock they set when the answer is right', async () => {
    await roomInWindow(LIMIT.windowSeconds, 10)
    const s = subject()
    await consume(LIMIT, s, app)
    await consume(LIMIT, s, app)

    const claim = await claimAttempt(GUARD, s, app)
    if (!claim.ok) throw new Error('refused')
    expect(claim.lockStart).toEqual(expect.any(String))
    await giveBack(GUARD, s, claim, app)

    expect(await lockRemaining(GUARD.lock, s, app)).toBe(0)
    expect((await peek(LIMIT, s, app)).count).toBe(2)
  })

  it('give back in the window they counted in, never in a later one', async () => {
    const s = subject()
    const counted = await consume(LIMIT, s, app)
    await release(LIMIT, s, new Date(counted.windowStart.getTime() - LIMIT.windowSeconds * 1000), app)
    expect((await peek(LIMIT, s, app)).count).toBe(1)
    await release(LIMIT, s, counted.windowStart, app)
    expect((await peek(LIMIT, s, app)).count).toBe(0)
  })
})
