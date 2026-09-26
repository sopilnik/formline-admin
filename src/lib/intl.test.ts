import { describe, expect, it } from 'vitest'
import { formatDate } from '@/lib/intl'

describe('formatDate', () => {
  it('writes the calendar date of the store time zone in the interface language', () => {
    const lateEvening = new Date('2026-09-24T22:30:00Z') // already 25 September in Berlin
    expect(formatDate(lateEvening, 'en')).toMatch(/^25 Sept? 2026$/)
    expect(formatDate(lateEvening, 'ru')).toMatch(/^25 сент\. 2026/)
  })
})
