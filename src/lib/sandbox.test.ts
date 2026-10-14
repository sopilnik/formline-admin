import { describe, expect, it } from 'vitest'
import { hoursLeft } from '@/lib/sandbox'

const now = Date.parse('2026-09-26T10:00:00Z')
const at = (ms: number) => new Date(now + ms)

describe('hoursLeft', () => {
  it('rounds the hours left up, so the figure is never earlier than the deletion, and never goes below zero', () => {
    expect(hoursLeft(at(24 * 3_600_000), now)).toBe(24)
    expect(hoursLeft(at(24 * 3_600_000 - 1), now)).toBe(24)
    expect(hoursLeft(at(2 * 3_600_000 + 1), now)).toBe(3)
    expect(hoursLeft(at(30 * 60_000), now)).toBe(1)
    expect(hoursLeft(at(0), now)).toBe(0)
    expect(hoursLeft(at(-1), now)).toBe(0)
  })
})
