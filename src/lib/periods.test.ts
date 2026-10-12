import { describe, expect, it } from 'vitest'
import { addDays, addMonths, dateInZone, daysInMonth, isoInZone, lastMoment, parsePeriod, periodPlan, PERIODS, presetRange, startOfDay, startOfMonth, validTimeZone, zonedParts, zonedToDate } from '@/lib/periods'

const berlin = 'Europe/Berlin'
const iso = (date: Date) => date.toISOString()

describe('zoned dates (review focus 3: DST day boundaries)', () => {
  it('reads the civil time of a zone', () => {
    expect(zonedParts(new Date('2026-09-24T22:30:00Z'), berlin)).toEqual({ year: 2026, month: 9, day: 25, hour: 0, minute: 30, second: 0 })
    expect(zonedParts(new Date('2026-01-01T00:00:00Z'), 'UTC').hour).toBe(0)
  })

  it('maps a civil time back to an instant, through the spring gap and the autumn overlap', () => {
    expect(iso(zonedToDate({ year: 2026, month: 9, day: 25, hour: 0, minute: 30 }, berlin))).toBe('2026-09-24T22:30:00.000Z')
    expect(iso(zonedToDate({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, berlin))).toBe('2026-03-29T01:30:00.000Z')  // 03:30 local
    expect(iso(zonedToDate({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, berlin))).toBe('2026-10-25T01:30:00.000Z')  // the later 02:30
  })

  it('gives 23- and 25-hour days across the transitions', () => {
    const spring = startOfDay(new Date('2026-03-29T12:00:00Z'), berlin)
    expect(iso(spring)).toBe('2026-03-28T23:00:00.000Z')
    expect((addDays(spring, 1, berlin).getTime() - spring.getTime()) / 3_600_000).toBe(23)
    const autumn = startOfDay(new Date('2026-10-25T12:00:00Z'), berlin)
    expect(iso(autumn)).toBe('2026-10-24T22:00:00.000Z')
    expect((addDays(autumn, 1, berlin).getTime() - autumn.getTime()) / 3_600_000).toBe(25)
    expect(iso(startOfDay(new Date('2026-09-27T23:30:00Z'), 'UTC'))).toBe('2026-09-27T00:00:00.000Z')
  })

  it('does calendar arithmetic on months', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(iso(startOfMonth(new Date('2026-09-27T09:00:00Z'), berlin))).toBe('2026-08-31T22:00:00.000Z')
    expect(iso(addMonths(new Date('2026-03-31T10:15:00Z'), -1, berlin))).toBe('2026-02-28T11:15:00.000Z')   // 12:15 local, clamped to February
    expect(iso(addDays(new Date('2026-09-27T09:00:00Z'), -30, berlin))).toBe('2026-08-28T09:00:00.000Z')
  })

  it('accepts only zones Intl knows', () => {
    expect(validTimeZone('Asia/Almaty')).toBe('Asia/Almaty')
    expect(validTimeZone('Mars/Olympus')).toBe('Europe/Berlin')
    expect(validTimeZone(null)).toBe('Europe/Berlin')
  })

  it('writes an instant as ISO 8601 with the offset of the zone at that instant', () => {
    expect(isoInZone(new Date('2026-09-24T12:02:00Z'), berlin)).toBe('2026-09-24T14:02:00+02:00')
    expect(isoInZone(new Date('2026-01-15T12:00:30.500Z'), berlin)).toBe('2026-01-15T13:00:30+01:00')
    expect(isoInZone(new Date('2026-09-24T12:02:00Z'), 'Asia/Kolkata')).toBe('2026-09-24T17:32:00+05:30')
    expect(isoInZone(new Date('2026-09-24T12:02:00Z'), 'America/New_York')).toBe('2026-09-24T08:02:00-04:00')
    expect(isoInZone(new Date('2026-09-24T12:02:00Z'), 'UTC')).toBe('2026-09-24T12:02:00+00:00')
  })
})

describe('presetRange', () => {
  const now = new Date('2026-09-27T09:00:00Z')  // Sunday 27 September, 11:00 in Berlin
  it('is open for "any time" and covers whole calendar days of the zone otherwise', () => {
    expect(presetRange('any', now, berlin)).toBeNull()
    expect(presetRange('today', now, berlin)).toEqual({ start: new Date('2026-09-26T22:00:00Z'), end: new Date('2026-09-27T22:00:00Z') })
    expect(presetRange('7d', now, berlin)).toEqual({ start: new Date('2026-09-20T22:00:00Z'), end: new Date('2026-09-27T22:00:00Z') })
    expect(presetRange('30d', now, berlin)).toEqual({ start: new Date('2026-08-28T22:00:00Z'), end: new Date('2026-09-27T22:00:00Z') })
    expect(presetRange('month', now, berlin)).toEqual({ start: new Date('2026-08-31T22:00:00Z'), end: new Date('2026-09-27T22:00:00Z') })
  })
})

describe('periodPlan (spec §8.1, amendment 4)', () => {
  const now = new Date('2026-09-27T09:00:00Z')  // Sunday 27 September, 11:00 in Berlin
  const range = (start: string, end: string) => ({ start: new Date(start), end: new Date(end) })
  const contiguous = (buckets: readonly ({ start: Date; end: Date } | null)[]) =>
    buckets.filter(b => b !== null).every((b, i, all) => i === 0 || b!.start.getTime() === all[i - 1]!.end.getTime())

  it('rolls whole days back from today and compares with the same span N days earlier', () => {
    const plan = periodPlan('30d', now, berlin)
    expect(plan.step).toBe('day')
    expect(plan.current).toEqual(range('2026-08-28T22:00:00Z', '2026-09-27T09:00:00Z'))
    expect(plan.previous).toEqual(range('2026-07-29T22:00:00Z', '2026-08-28T09:00:00Z'))
    expect(plan.buckets).toHaveLength(30)
    expect(plan.buckets.at(-1)).toEqual(range('2026-09-26T22:00:00Z', '2026-09-27T09:00:00Z'))
    expect(plan.previousBuckets.at(-1)).toEqual(range('2026-08-27T22:00:00Z', '2026-08-28T09:00:00Z'))
    expect(periodPlan('7d', now, berlin).current).toEqual(range('2026-09-20T22:00:00Z', '2026-09-27T09:00:00Z'))
  })

  it('uses 7-day weeks counted back from today on 90 days, the earliest one shorter', () => {
    const plan = periodPlan('90d', now, berlin)
    expect(plan.step).toBe('week')
    expect(plan.buckets).toHaveLength(13)
    expect(plan.buckets[0]).toEqual(range('2026-06-29T22:00:00Z', '2026-07-05T22:00:00Z'))
    expect(plan.buckets.at(-1)).toEqual(range('2026-09-20T22:00:00Z', '2026-09-27T09:00:00Z'))
    expect(plan.previous).toEqual(range('2026-03-31T22:00:00Z', '2026-06-29T09:00:00Z'))
  })

  it('compares this month with the same days of the previous month, clamped to its length', () => {
    const september = periodPlan('month', now, berlin)
    expect(september.current).toEqual(range('2026-08-31T22:00:00Z', '2026-09-27T09:00:00Z'))
    expect(september.previous).toEqual(range('2026-07-31T22:00:00Z', '2026-08-27T09:00:00Z'))
    expect(september.buckets).toHaveLength(27)
    const march = periodPlan('month', new Date('2026-03-30T10:00:00Z'), berlin)  // 12:00 in Berlin, the day after the spring change
    expect(march.previous).toEqual(range('2026-01-31T23:00:00Z', '2026-02-28T11:00:00Z'))
    expect(march.previousBuckets[27]).toEqual(range('2026-02-27T23:00:00Z', '2026-02-28T11:00:00Z'))
    expect(march.previousBuckets.slice(28)).toEqual([null, null])
  })

  it('keeps the buckets contiguous over the whole period, 25-hour day included', () => {
    for (const period of PERIODS) {
      const plan = periodPlan(period, now, berlin)
      expect(contiguous(plan.buckets), period).toBe(true)
      expect(contiguous(plan.previousBuckets), period).toBe(true)
      expect(plan.buckets[0]!.start).toEqual(plan.current.start)
      expect(plan.buckets.at(-1)!.end).toEqual(plan.current.end)
      const previous = plan.previousBuckets.filter(b => b !== null)
      expect(previous[0]!.start).toEqual(plan.previous.start)
      expect(previous.at(-1)!.end).toEqual(plan.previous.end)
    }
    const october = periodPlan('30d', new Date('2026-10-30T12:00:00Z'), berlin)
    const long = october.buckets.find(b => b.end.getTime() - b.start.getTime() === 25 * 3_600_000)
    expect(long?.start).toEqual(new Date('2026-10-24T22:00:00Z'))
  })

  it('reads the period from the URL and names the last moment of a range', () => {
    expect(parsePeriod('90d')).toBe('90d')
    expect(parsePeriod(['month', '7d'])).toBe('month')
    expect(parsePeriod('year')).toBe('30d')
    expect(parsePeriod(undefined)).toBe('30d')
    expect(lastMoment(range('2026-08-28T22:00:00Z', '2026-09-27T09:00:00Z'))).toEqual(new Date('2026-09-27T08:59:59.999Z'))
  })
})

describe('dateInZone', () => {
  it('names the civil date of the zone, which may differ from the UTC date', () => {
    expect(dateInZone(new Date('2026-09-30T22:30:00Z'), 'Europe/Berlin')).toBe('2026-10-01')
    expect(dateInZone(new Date('2026-09-30T22:30:00Z'), 'America/New_York')).toBe('2026-09-30')
    expect(dateInZone(new Date('0999-03-04T12:00:00Z'), 'UTC')).toBe('0999-03-04')
  })
})
