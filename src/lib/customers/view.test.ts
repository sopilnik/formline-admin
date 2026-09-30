import { describe, expect, it } from 'vitest'
import { customerHref, locationOf, toCustomerRowView } from '@/lib/customers/view'
import type { CustomerRow } from '@/server/dal/customers'

const row: CustomerRow = {
  id: 'c1', name: 'Anna Keller', email: 'anna.keller@example.com', city: 'Berlin', country: 'DE',
  orders: 1204, spentCents: 1_234_550, lastOrderAt: new Date('2026-09-27T22:30:00Z'),
}

describe('toCustomerRowView', () => {
  it('formats the row for the list in the store zone', () => {
    expect(toCustomerRowView(row, 'en', 'Europe/Berlin')).toEqual({
      id: 'c1', href: '/customers/c1', name: 'Anna Keller', email: 'anna.keller@example.com', location: 'Berlin, Germany',
      orders: 1204, ordersText: '1,204', spent: '$12,345.50', last: '28 Sept 2026',
    })
  })

  it('writes Russian numbers and country names, and no date without orders', () => {
    const view = toCustomerRowView({ ...row, orders: 0, spentCents: 0, lastOrderAt: null }, 'ru', 'Europe/Berlin')
    expect(view.location).toBe('Berlin, Германия')
    expect(view.spent).toBe('0,00\u00a0$')
    expect(view.last).toBeNull()
  })
})

describe('locationOf', () => {
  it('joins what is known and leaves out what is not', () => {
    expect(locationOf('Paris', 'FR', 'en')).toBe('Paris, France')
    expect(locationOf(null, 'BE', 'ru')).toBe('Бельгия')
    expect(locationOf('Brno', null, 'en')).toBe('Brno')
    expect(locationOf(null, null, 'en')).toBeNull()
  })
})

describe('customerHref', () => {
  it('addresses a customer by id', () => {
    expect(customerHref('0b8e5f1c')).toBe('/customers/0b8e5f1c')
  })
})
