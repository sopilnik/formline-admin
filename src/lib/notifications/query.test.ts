import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATIONS_QUERY, notificationsHref, parseNotificationsQuery } from '@/lib/notifications/query'

describe('notifications query', () => {
  it('reads the page and its size, and falls back to the defaults', () => {
    expect(parseNotificationsQuery({ page: '2', size: '100' })).toEqual({ page: 2, size: 100 })
    expect(parseNotificationsQuery({ page: ['3', '4'], size: '30' })).toEqual({ page: 3, size: 25 })
    expect(parseNotificationsQuery({})).toEqual(DEFAULT_NOTIFICATIONS_QUERY)
  })

  it('leaves the defaults out and starts again at page 1 when the size changes', () => {
    expect(notificationsHref(DEFAULT_NOTIFICATIONS_QUERY)).toBe('/notifications')
    expect(notificationsHref({ page: 2, size: 25 }, { page: 3 })).toBe('/notifications?page=3')
    expect(notificationsHref({ page: 2, size: 25 }, { size: 50 })).toBe('/notifications?size=50')
  })
})
