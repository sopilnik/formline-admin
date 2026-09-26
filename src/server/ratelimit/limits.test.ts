import { describe, expect, it } from 'vitest'
import { passwordLockSeconds } from '@/server/ratelimit/limits'

describe('passwordLockSeconds', () => {
  it('locks from the fifth failure: 15 minutes, doubling, at most an hour', () => {
    expect(passwordLockSeconds(4)).toBe(0)
    expect(passwordLockSeconds(5)).toBe(15 * 60)
    expect(passwordLockSeconds(6)).toBe(30 * 60)
    expect(passwordLockSeconds(7)).toBe(60 * 60)
    expect(passwordLockSeconds(12)).toBe(60 * 60)
  })
})
