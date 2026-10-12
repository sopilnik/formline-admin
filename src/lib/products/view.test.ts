import { describe, expect, it } from 'vitest'
import { productHref, toProductRowView, type ProductRow } from '@/lib/products/view'

const row: ProductRow = {
  id: 'p1', slug: 'far-orbit', name: 'Far Orbit', status: 'published',
  collection: { id: 'c1', slug: 'night', name: 'Night' },
  image: { id: 'i1', storagePath: 'posters/far-orbit.webp', source: 'static' },
  priceFromCents: 3100, stock: 1234, variants: 6, soldOut: 2, low: 3,
  updatedAt: new Date('2026-09-27T22:30:00Z'),
}

describe('toProductRowView', () => {
  it('formats the row for the list in the store zone', () => {
    expect(toProductRowView(row, 'en', 'Europe/Berlin')).toEqual({
      id: 'p1', href: '/products/far-orbit', name: 'Far Orbit', status: 'published', collection: 'Night',
      imageSrc: '/posters/far-orbit.webp', priceFrom: '$31.00', stock: '1,234', soldOut: 2, low: 1, updated: '28 Sept 2026',
    })
  })

  it('writes Russian numbers and keeps an upload behind the media route', () => {
    const view = toProductRowView({ ...row, image: { id: 'i9', storagePath: 'ws/w/i9.webp', source: 'upload' }, priceFromCents: null }, 'ru', 'Europe/Berlin')
    expect(view.imageSrc).toBe('/media/i9')
    expect(view.priceFrom).toBeNull()
    expect(view.stock).toBe('1 234')
  })

  it('links the product by its slug', () => {
    expect(productHref('low-tide')).toBe('/products/low-tide')
  })
})
