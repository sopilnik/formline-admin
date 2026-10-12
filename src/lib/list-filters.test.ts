import { describe, expect, it } from 'vitest'
import { ALL, hiddenFields, statusesFrom } from '@/lib/list-filters'

const STATUSES = ['new', 'paid', 'shipped'] as const

describe('list filters', () => {
  it('clear the statuses when "all" is pressed, and keep the pressed ones in their own order', () => {
    expect(statusesFrom(STATUSES, [ALL, 'paid'], ['paid'])).toEqual([])
    expect(statusesFrom(STATUSES, [ALL, 'shipped'], [])).toEqual(['shipped'])
    expect(statusesFrom(STATUSES, ['shipped', 'new', 'lost'], ['new'])).toEqual(['new', 'shipped'])
    expect(statusesFrom(STATUSES, [], ['paid'])).toEqual([])
  })

  it('send a list URL\'s parameters as hidden fields, and none for a bare path', () => {
    expect(hiddenFields('/orders?status=new,paid&sort=total')).toEqual([['status', 'new,paid'], ['sort', 'total']])
    expect(hiddenFields('/orders')).toEqual([])
  })
})
