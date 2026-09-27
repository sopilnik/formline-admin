import { describe, expect, it } from 'vitest'
import { addDays, addMonths, daysInMonth, isoInZone, presetRange, startOfDay, startOfMonth, validTimeZone, zonedParts, zonedToDate } from '@/lib/periods'

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
