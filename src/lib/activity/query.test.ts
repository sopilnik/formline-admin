import { describe, expect, it } from 'vitest'
import { activityHref, DEFAULT_ACTIVITY_QUERY, isActivityFiltered, parseActivityQuery } from '@/lib/activity/query'

const ID = '0b8e5f1c-1234-4abc-8def-0123456789ab'

describe('parseActivityQuery', () => {
  it('reads the actor, the action, the period and the page', () => {
    expect(parseActivityQuery({ actor: ID, action: 'order.status_changed', when: '7d', page: '2', size: '50' }))
      .toEqual({ actor: ID, action: 'order.status_changed', when: '7d', page: 2, size: 50 })
    expect(parseActivityQuery({ actor: 'system' }).actor).toBe('system')
  })

  it('falls back to the defaults on unknown values', () => {
    expect(parseActivityQuery({ actor: 'dana', action: 'order.deleted', when: 'yesterday', page: '0', size: '9' })).toEqual(DEFAULT_ACTIVITY_QUERY)
  })
})

describe('activityHref', () => {
  it('leaves the defaults out and round-trips through the parser', () => {
    expect(activityHref(DEFAULT_ACTIVITY_QUERY)).toBe('/activity')
    const query = { actor: ID, action: 'team.invited' as const, when: 'month' as const, page: 3, size: 100 as const }
    const href = activityHref(query)
    expect(href).toBe(`/activity?actor=${ID}&action=team.invited&when=month&page=3&size=100`)
    expect(parseActivityQuery(new URLSearchParams(href.split('?')[1]))).toEqual(query)
  })

  it('goes back to the first page when a filter changes', () => {
    expect(activityHref({ ...DEFAULT_ACTIVITY_QUERY, page: 4 }, { action: 'auth.sign_in' })).toBe('/activity?action=auth.sign_in')
    expect(activityHref({ ...DEFAULT_ACTIVITY_QUERY, page: 4 }, { page: 5 })).toBe('/activity?page=5')
  })
})

describe('isActivityFiltered', () => {
  it('is on for any filter, not for the page', () => {
    expect(isActivityFiltered({ ...DEFAULT_ACTIVITY_QUERY, page: 3 })).toBe(false)
    expect(isActivityFiltered({ ...DEFAULT_ACTIVITY_QUERY, when: 'today' })).toBe(true)
  })
})
