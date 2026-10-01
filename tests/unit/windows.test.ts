import { describe, expect, it } from 'vitest'
import { waitForRoom } from '../windows'

const minute = 60_000

describe('waitForRoom', () => {
  it('does not wait while the window has room for the work', () => {
    expect(waitForRoom(5 * minute, 60, 10)).toBe(0)
    expect(waitForRoom(5 * minute + 49_000, 60, 10)).toBe(0)
  })

  it('waits into the next window when the current one ends too soon', () => {
    expect(waitForRoom(5 * minute + 50_000, 60, 10)).toBe(10_250)
    expect(waitForRoom(5 * minute + 59_900, 60, 10)).toBe(350)
  })

  it('counts windows from the epoch, as the database does', () => {
    const quarter = 15 * minute
    expect(waitForRoom(4 * quarter - 3_000, 15 * 60, 10)).toBe(3_250)
    expect(waitForRoom(4 * quarter, 15 * 60, 10)).toBe(0)
  })
})
