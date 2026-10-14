import { describe, expect, it } from 'vitest'
import { DEFAULT_ORDERS_QUERY, isOrdersFiltered, ordersExportHref, ordersHref, parseOrdersQuery } from '@/lib/orders/query'

describe('parseOrdersQuery', () => {
  it('falls back to the defaults for missing and unknown values', () => {
    expect(parseOrdersQuery({})).toEqual(DEFAULT_ORDERS_QUERY)
    expect(parseOrdersQuery({ status: 'lost', placed: 'yesterday', source: 'fax', sort: 'color', dir: 'up', page: '0', size: '7' })).toEqual(DEFAULT_ORDERS_QUERY)
    expect(parseOrdersQuery(new URLSearchParams('page=abc&size=100'))).toEqual({ ...DEFAULT_ORDERS_QUERY, size: 100 })
  })

  it('reads every field, repeated or comma-separated statuses included', () => {
    const query = parseOrdersQuery(new URLSearchParams('status=paid,processing&q=%20maya%20&placed=7d&source=stripe&sort=total&dir=asc&page=3&size=50'))
    expect(query).toEqual({ status: ['paid', 'processing'], q: 'maya', placed: '7d', source: 'stripe', sort: 'total', dir: 'asc', page: 3, size: 50 })
    expect(parseOrdersQuery({ status: ['shipped', 'paid', 'shipped'] }).status).toEqual(['paid', 'shipped'])
    expect(parseOrdersQuery({ q: 'x'.repeat(300) }).q).toHaveLength(100)
  })
})

describe('ordersHref', () => {
  it('writes only what differs from the defaults, in a fixed order', () => {
    expect(ordersHref(DEFAULT_ORDERS_QUERY)).toBe('/orders')
    expect(ordersHref({ ...DEFAULT_ORDERS_QUERY, status: ['processing', 'paid'], q: 'maya', page: 2 })).toBe('/orders?status=paid,processing&q=maya&page=2')
    expect(ordersHref({ ...DEFAULT_ORDERS_QUERY, sort: 'total', dir: 'asc', size: 100 })).toBe('/orders?sort=total&dir=asc&size=100')
  })

  it('goes back to the first page when a filter or the sort changes, and keeps it when only the page changes', () => {
    const page3 = { ...DEFAULT_ORDERS_QUERY, page: 3 }
    expect(ordersHref(page3, { source: 'seed' })).toBe('/orders?source=seed')
    expect(ordersHref(page3, { sort: 'number' })).toBe('/orders?sort=number')
    expect(ordersHref(page3, { page: 4 })).toBe('/orders?page=4')
    expect(ordersHref(page3, { size: 50 })).toBe('/orders?size=50')
  })

  it('knows when a filter is active', () => {
    expect(isOrdersFiltered(DEFAULT_ORDERS_QUERY)).toBe(false)
    expect(isOrdersFiltered({ ...DEFAULT_ORDERS_QUERY, sort: 'total', page: 2 })).toBe(false)
    expect(isOrdersFiltered({ ...DEFAULT_ORDERS_QUERY, placed: 'today' })).toBe(true)
  })
})

describe('ordersExportHref', () => {
  it('carries the filters and the sort but not the page', () => {
    expect(ordersExportHref(DEFAULT_ORDERS_QUERY)).toBe('/api/orders/export')
    expect(ordersExportHref({ ...DEFAULT_ORDERS_QUERY, status: ['paid'], sort: 'total', page: 3, size: 50 })).toBe('/api/orders/export?status=paid&sort=total')
  })

  it('exports a selection in the list order, without the filters', () => {
    expect(ordersExportHref({ ...DEFAULT_ORDERS_QUERY, status: ['paid'], q: 'maya', sort: 'total' }, ['a', 'b'])).toBe('/api/orders/export?sort=total&ids=a,b')
  })
})
