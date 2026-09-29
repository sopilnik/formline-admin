import { describe, expect, it } from 'vitest'
import { canDeleteProduct, canTransitionProduct, isProductStatus, nextProductStatuses, PRODUCT_STATUSES } from '@/lib/products/status'

describe('product status machine', () => {
  it('moves between draft and published both ways and archives either', () => {
    expect(nextProductStatuses('draft')).toEqual(['published', 'archived'])
    expect(nextProductStatuses('published')).toEqual(['draft', 'archived'])
  })

  it('brings an archived product back as a draft only', () => {
    expect(nextProductStatuses('archived')).toEqual(['draft'])
    expect(canTransitionProduct('archived', 'published')).toBe(false)
  })

  it('never moves a status onto itself', () => {
    for (const status of PRODUCT_STATUSES) expect(canTransitionProduct(status, status)).toBe(false)
  })

  it('knows its statuses', () => {
    expect(PRODUCT_STATUSES.every(isProductStatus)).toBe(true)
    expect(isProductStatus('active')).toBe(false)
  })

  it('deletes drafts without orders only', () => {
    expect(canDeleteProduct('draft', false)).toBe(true)
    expect(canDeleteProduct('draft', true)).toBe(false)
    expect(canDeleteProduct('published', false)).toBe(false)
    expect(canDeleteProduct('archived', false)).toBe(false)
  })
})
