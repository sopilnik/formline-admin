import { describe, expect, it, vi } from 'vitest'
import { msUntilNextRun, scheduleDailyJob, type Timer } from '@/server/jobs/daily'

const HOUR = 3_600_000
const DAY = 24 * HOUR

function fakeTimer() {
  const queue: { ms: number; fn: () => void }[] = []
  const timer: Timer = {
    after(ms, fn) {
      const entry = { ms, fn }

      queue.push(entry)

      return () => {
        const i = queue.indexOf(entry)

        if (i >= 0) queue.splice(i, 1)
      }
    },
  }
  const fire = () => {
    const entry = queue.shift()

    if (!entry) throw new Error('nothing scheduled')
    entry.fn()
  }

  return { timer, queue, fire }
}

describe('msUntilNextRun', () => {
  it('targets 03:17 UTC today when that is still ahead, otherwise tomorrow', () => {
    expect(msUntilNextRun(Date.parse('2026-09-26T02:00:00Z'))).toBe(HOUR + 17 * 60_000)
    expect(msUntilNextRun(Date.parse('2026-09-26T03:17:00Z'))).toBe(DAY)
    expect(msUntilNextRun(Date.parse('2026-09-26T03:17:00.001Z'))).toBe(DAY - 1)
    expect(msUntilNextRun(Date.parse('2026-09-26T10:00:00Z'))).toBe(17 * HOUR + 17 * 60_000)
  })
})

describe('scheduleDailyJob', () => {
  it('runs at the next slot, then every 24 hours, until stopped', async () => {
    const now = Date.parse('2026-09-26T10:00:00Z')
    const run = vi.fn(async () => undefined)
    const { timer, queue, fire } = fakeTimer()
    const stop = scheduleDailyJob(run, now, timer)

    expect(queue.map(q => q.ms)).toEqual([msUntilNextRun(now)])
    fire()
    expect(run).toHaveBeenCalledTimes(1)
    expect(queue.map(q => q.ms)).toEqual([DAY])
    fire()
    expect(run).toHaveBeenCalledTimes(2)
    stop()
    expect(queue).toEqual([])
  })

  it('keeps going when a run fails', async () => {
    const run = vi.fn(async () => { throw new Error('database away') })
    const { timer, queue, fire } = fakeTimer()

    scheduleDailyJob(run, Date.parse('2026-09-26T10:00:00Z'), timer)
    fire()
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(1)
    expect(queue.map(q => q.ms)).toEqual([DAY])
  })
})
