import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatDay, formatDayRange, formatMoney, formatNumber, formatPercent, formatShare } from '@/lib/intl'

describe('formatDate', () => {
  it('writes the calendar date of the store time zone in the interface language', () => {
    const lateEvening = new Date('2026-09-24T22:30:00Z') // already 25 September in Berlin
    expect(formatDate(lateEvening, 'en')).toMatch(/^25 Sept? 2026$/)
    expect(formatDate(lateEvening, 'ru')).toMatch(/^25 сент\. 2026/)
  })
})

describe('money, numbers and dates (spec §11)', () => {
  it('formats money with the narrow symbol in each language', () => {
    expect(formatMoney(1428600, 'en', 'whole')).toBe('$14,286')
    expect(formatMoney(6676, 'en')).toBe('$66.76')
    expect(formatMoney(11800, 'en')).toBe('$118.00')
    expect(formatMoney(1428600, 'ru', 'whole')).toBe('14\u00a0286\u00a0$')
    expect(formatNumber(1234, 'en')).toBe('1,234')
  })

  it('formats a signed percentage with a real minus sign', () => {
    expect(formatPercent(0.124, 'en')).toBe('+12.4%')
    expect(formatPercent(-0.047, 'en')).toBe('\u22124.7%')
    expect(formatPercent(0, 'en')).toBe('0%')
    expect(formatPercent(0.124, 'ru')).toBe('+12,4\u00a0%')
  })

  it('formats date-times, days and ranges in the store zone', () => {
    const t = new Date('2026-09-24T12:02:00Z')
    expect(formatDateTime(t, 'en', 'Europe/Berlin')).toMatch(/^24 Sept?, 14:02$/)
    expect(formatDateTime(t, 'ru', 'Europe/Berlin')).toBe('24 сент., 14:02')
    expect(formatDay(t, 'en', 'Europe/Berlin')).toMatch(/^24 Sept?$/)
    // English ranges put thin spaces (U+2009) around the dash; Russian ones plain spaces (ICU, checked on Node 26).
    expect(formatDayRange(new Date('2026-08-25T22:00:00Z'), new Date('2026-09-24T12:00:00Z'), 'en', 'Europe/Berlin')).toMatch(/^26 Aug – 24 Sept?$/)
    expect(formatDayRange(new Date('2026-08-25T22:00:00Z'), new Date('2026-09-24T12:00:00Z'), 'ru', 'Europe/Berlin')).toBe('26 авг. – 24 сент.')
  })

  it('formats a share without a sign', () => {
    expect(formatShare(0.36, 'en')).toBe('36%')
    expect(formatShare(0.124, 'en', 1)).toBe('12.4%')
    expect(formatShare(0.36, 'ru')).toBe('36 %')
  })
})
