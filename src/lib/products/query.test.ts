import { describe, expect, it } from 'vitest'
import { DEFAULT_PRODUCTS_QUERY, isProductsFiltered, parseProductsQuery, productsHref } from '@/lib/products/query'

describe('parseProductsQuery', () => {
  it('reads every filter, the sort and the page', () => {
    expect(parseProductsQuery({ status: 'draft,published', q: ' orbit ', collection: 'night', stock: 'out', sort: 'price', dir: 'desc', page: '2', size: '50' })).toEqual({
      status: ['published', 'draft'], q: 'orbit', collection: 'night', stock: 'out', sort: 'price', dir: 'desc', page: 2, size: 50,
    })
  })

  it('falls back to the defaults on unknown values', () => {
    expect(parseProductsQuery({ status: 'active', collection: 'Night Sky', stock: 'some', sort: 'size', dir: 'up', page: '0', size: '7' })).toEqual(DEFAULT_PRODUCTS_QUERY)
    expect(parseProductsQuery(new URLSearchParams(''))).toEqual(DEFAULT_PRODUCTS_QUERY)
  })

  it('starts each sort in its own direction', () => {
    expect(parseProductsQuery({ sort: 'updated' }).dir).toBe('desc')
    expect(parseProductsQuery({ sort: 'stock' }).dir).toBe('asc')
  })

  it('caps the search text', () => {
    expect(parseProductsQuery({ q: 'x'.repeat(300) }).q).toHaveLength(100)
  })
})

describe('productsHref', () => {
  it('leaves the defaults out', () => {
    expect(productsHref(DEFAULT_PRODUCTS_QUERY)).toBe('/products')
    expect(productsHref(DEFAULT_PRODUCTS_QUERY, { sort: 'updated', dir: 'desc' })).toBe('/products?sort=updated')
  })

  it('writes the overview links the same way', () => {
    expect(productsHref(DEFAULT_PRODUCTS_QUERY, { stock: 'out' })).toBe('/products?stock=out')
    expect(productsHref(DEFAULT_PRODUCTS_QUERY, { stock: 'low' })).toBe('/products?stock=low')
  })

  it('round-trips through the parser', () => {
    const query = { status: ['draft' as const], q: 'low tide', collection: 'monochrome', stock: 'low' as const, sort: 'price' as const, dir: 'desc' as const, page: 3, size: 100 as const }
    const href = productsHref(query)
    expect(href).toBe('/products?status=draft&q=low+tide&collection=monochrome&stock=low&sort=price&dir=desc&page=3&size=100')
    expect(parseProductsQuery(new URLSearchParams(href.split('?')[1]))).toEqual(query)
  })

  it('goes back to the first page when a filter, the sort or the size changes, and keeps it when only the page changes', () => {
    const page3 = { ...DEFAULT_PRODUCTS_QUERY, page: 3 }
    expect(productsHref(page3)).toBe('/products?page=3')
    expect(productsHref(page3, { page: 4 })).toBe('/products?page=4')
    expect(productsHref(page3, { stock: 'low' })).toBe('/products?stock=low')
    expect(productsHref(page3, { sort: 'stock' })).toBe('/products?sort=stock')
    expect(productsHref(page3, { size: 50 })).toBe('/products?size=50')
  })
})

describe('isProductsFiltered', () => {
  it('counts filters, not the sort or the page', () => {
    expect(isProductsFiltered(DEFAULT_PRODUCTS_QUERY)).toBe(false)
    expect(isProductsFiltered({ ...DEFAULT_PRODUCTS_QUERY, sort: 'price', dir: 'desc', page: 2, size: 50 })).toBe(false)
    expect(isProductsFiltered({ ...DEFAULT_PRODUCTS_QUERY, stock: 'out' })).toBe(true)
    expect(isProductsFiltered({ ...DEFAULT_PRODUCTS_QUERY, collection: 'night' })).toBe(true)
  })
})
