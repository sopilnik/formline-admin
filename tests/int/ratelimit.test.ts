import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearSubject, consume, lockRemaining, peek, setLock } from '@/server/ratelimit/consume'
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
  it('hold for their duration from the moment they are set', async () => {
    const s = subject()
    expect(await lockRemaining('test.lock', s, 3600, app)).toBe(0)
    await setLock('test.lock', s, app)
    const left = await lockRemaining('test.lock', s, 3600, app)
    expect(left).toBeGreaterThan(3590)
    expect(left).toBeLessThanOrEqual(3600)
  })

  it('run out after their duration', async () => {
    const s = subject()
    await admin.query("insert into fa.rate_limits (purpose, subject, window_start, count) values ('test.lock', $1, now() - interval '2 hours', 1)", [s])
    expect(await lockRemaining('test.lock', s, 3600, app)).toBe(0)
  })

  it('clear together with the counters of their subject', async () => {
    const s = subject()
    await setLock('test.lock', s, app)
    await consume(LIMIT, s, app)
    await clearSubject(s, app)
    expect(await lockRemaining('test.lock', s, 3600, app)).toBe(0)
    expect((await peek(LIMIT, s, app)).count).toBe(0)
  })
})

describe('privileges', () => {
  it('the application role can count but never delete', async () => {
    await expect(app.query('delete from fa.rate_limits')).rejects.toThrow(/permission denied/)
  })
})
