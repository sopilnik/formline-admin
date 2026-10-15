import { describe, expect, it } from 'vitest'
import { asDate } from '@/server/db/as-date'

describe('asDate', () => {
  it('reads the text a raw statement gives and keeps a Date as it is', () => {
    const at = new Date('2026-10-10T12:00:00Z')

    expect(asDate('2026-10-10 12:00:00+00')).toEqual(at)
    expect(asDate(at)).toBe(at)
  })
})
