import { describe, expect, it } from 'vitest'
import { orderHref, toRowView } from '@/lib/orders/view'

describe('toRowView', () => {
  it('formats money and time on the server and links the order by its number', () => {
    const view = toRowView({
      id: '0f8f6a54-7f7d-4c1e-9d55-2b8f3f0e9a11', number: 1412, placedAt: new Date('2026-09-24T12:02:00Z'), customerName: 'Maya Lindqvist',
      customerEmail: 'maya.l@example.com', items: 3, totalCents: 11800, status: 'paid', source: 'stripe',
    }, 'en', 'Europe/Berlin')
    expect(view).toMatchObject({ number: 1412, href: '/orders/1412', total: '$118.00', items: 3, status: 'paid', source: 'stripe' })
    expect(view.placed).toMatch(/^24 Sept?, 14:02$/)
    expect(orderHref(1001)).toBe('/orders/1001')
  })
})
