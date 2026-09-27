import { describe, expect, it } from 'vitest'
import { retryDelayHours } from '@/server/media/deletions'

describe('retryDelayHours', () => {
  it('doubles from one hour and stops at a day', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelayHours)).toEqual([1, 2, 4, 8, 16, 24, 24])
  })
})
