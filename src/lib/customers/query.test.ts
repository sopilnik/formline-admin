import { describe, expect, it } from 'vitest'
import { customersExportHref, customersHref, DEFAULT_CUSTOMERS_QUERY, isCustomersFiltered, parseCustomersQuery } from '@/lib/customers/query'

describe('parseCustomersQuery', () => {
  it('reads the search, the sort and the page', () => {
    expect(parseCustomersQuery({ q: ' carter ', sort: 'spent', dir: 'asc', page: '2', size: '50' })).toEqual({
      q: 'carter', sort: 'spent', dir: 'asc', page: 2, size: 50,
    })
  })

  it('falls back to the defaults on unknown values', () => {
    expect(parseCustomersQuery({ sort: 'city', dir: 'up', page: '-1', size: '10' })).toEqual(DEFAULT_CUSTOMERS_QUERY)
    expect(parseCustomersQuery(new URLSearchParams(''))).toEqual(DEFAULT_CUSTOMERS_QUERY)
  })

  it('starts each sort in its own direction', () => {
    expect(parseCustomersQuery({ sort: 'name' }).dir).toBe('asc')
    expect(parseCustomersQuery({ sort: 'orders' }).dir).toBe('desc')
    expect(parseCustomersQuery({}).sort).toBe('last')
  })

  it('caps the search text and takes the first of repeated values', () => {
    expect(parseCustomersQuery({ q: 'x'.repeat(300) }).q).toHaveLength(100)
    expect(parseCustomersQuery({ q: ['anna', 'ben'] }).q).toBe('anna')
  })
})

describe('customersHref', () => {
  it('leaves the defaults out', () => {
    expect(customersHref(DEFAULT_CUSTOMERS_QUERY)).toBe('/customers')
    expect(customersHref(DEFAULT_CUSTOMERS_QUERY, { sort: 'name', dir: 'asc' })).toBe('/customers?sort=name')
    expect(customersHref(DEFAULT_CUSTOMERS_QUERY, { sort: 'last', dir: 'asc' })).toBe('/customers?dir=asc')
  })

  it('round-trips through the parser', () => {
    const query = { q: 'anna@example', sort: 'orders' as const, dir: 'asc' as const, page: 3, size: 100 as const }
    const href = customersHref(query)

    expect(href).toBe('/customers?q=anna%40example&sort=orders&dir=asc&page=3&size=100')
    expect(parseCustomersQuery(new URLSearchParams(href.split('?')[1]))).toEqual(query)
  })

  it('goes back to the first page when the search, the sort or the size changes, and keeps it when only the page changes', () => {
    const page3 = { ...DEFAULT_CUSTOMERS_QUERY, page: 3 }

    expect(customersHref(page3)).toBe('/customers?page=3')
    expect(customersHref(page3, { page: 4 })).toBe('/customers?page=4')
    expect(customersHref(page3, { q: 'ben' })).toBe('/customers?q=ben')
    expect(customersHref(page3, { sort: 'spent', dir: 'desc' })).toBe('/customers?sort=spent')
    expect(customersHref(page3, { size: 50 })).toBe('/customers?size=50')
  })
})

describe('isCustomersFiltered', () => {
  it('is on only while there is a search', () => {
    expect(isCustomersFiltered(DEFAULT_CUSTOMERS_QUERY)).toBe(false)
    expect(isCustomersFiltered({ ...DEFAULT_CUSTOMERS_QUERY, sort: 'name', dir: 'asc', page: 2 })).toBe(false)
    expect(isCustomersFiltered({ ...DEFAULT_CUSTOMERS_QUERY, q: 'ben' })).toBe(true)
  })
})

describe('customersExportHref', () => {
  it('carries the search and the sort, never the page or its size', () => {
    expect(customersExportHref(DEFAULT_CUSTOMERS_QUERY)).toBe('/api/customers/export')
    expect(customersExportHref({ q: 'anna', sort: 'spent', dir: 'desc', page: 4, size: 100 })).toBe('/api/customers/export?q=anna&sort=spent')
  })
})
