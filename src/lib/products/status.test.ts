import { describe, expect, it } from 'vitest'
import { canTransitionProduct, deleteBlocker, isProductStatus, nextProductStatuses, PRODUCT_STATUSES } from '@/lib/products/status'

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

  it('deletes drafts without orders only, and names orders first as the reason', () => {
    expect(deleteBlocker('draft', false)).toBeNull()
    expect(deleteBlocker('draft', true)).toBe('has_orders')
    expect(deleteBlocker('published', true)).toBe('has_orders')
    expect(deleteBlocker('published', false)).toBe('not_draft')
    expect(deleteBlocker('archived', false)).toBe('not_draft')
  })
})
