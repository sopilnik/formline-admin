import { describe, expect, it } from 'vitest'
import { describeEntry, type Lookups } from '@/lib/activity/describe'

const lookups: Lookups = {
  users: new Map([['u1', 'Noah Becker']]),
  orders: new Map([['o1', 1042]]),
  products: new Map([['p1', { slug: 'far-orbit', name: 'Far Orbit' }]]),
  collections: new Map([['c1', { slug: 'night', name: 'Night' }]]),
  customers: new Map([['k1', 'Anna Keller']]),
}

describe('describeEntry', () => {
  it('links an entity that still exists under its current name', () => {
    expect(describeEntry({ action: 'order.status_changed', entityType: 'order', entityId: 'o1', details: { number: 1042, from: 'paid', to: 'processing', bulk: true } }, lookups))
      .toEqual({ subject: { text: '#1042', href: '/orders/1042' }, detail: { kind: 'orderStatus', from: 'paid', to: 'processing', bulk: true } })
    expect(describeEntry({ action: 'product.updated', entityType: 'product', entityId: 'p1', details: { slug: 'old-slug', changed: ['name', 'slug'] } }, lookups))
      .toEqual({ subject: { text: 'Far Orbit', href: '/products/far-orbit' }, detail: { kind: 'fields', fields: ['name', 'slug'] } })
    expect(describeEntry({ action: 'customer.notes_updated', entityType: 'customer', entityId: 'k1', details: { name: 'Anna K.' } }, lookups).subject)
      .toEqual({ text: 'Anna Keller', href: '/customers/k1' })
  })

  it('names a deleted entity without a link', () => {
    expect(describeEntry({ action: 'product.deleted', entityType: 'product', entityId: 'gone', details: { slug: 'hush', name: 'Hush', variants: 6 } }, lookups))
      .toEqual({ subject: { text: 'Hush', href: null }, detail: { kind: 'variants', count: 6 } })
    expect(describeEntry({ action: 'collection.deleted', entityType: 'collection', entityId: 'gone', details: { slug: 'sand', name: 'Sand' } }, lookups).subject)
      .toEqual({ text: 'Sand', href: null })
  })

  it('reads the details of the team and security entries', () => {
    expect(describeEntry({ action: 'team.role_changed', entityType: 'user', entityId: 'u1', details: { name: 'Noah', from: 'admin', to: 'viewer' } }, lookups))
      .toEqual({ subject: { text: 'Noah Becker', href: null }, detail: { kind: 'role', from: 'admin', to: 'viewer' } })
    expect(describeEntry({ action: 'team.invited', entityType: 'invitation', entityId: 'i1', details: { email: 'alex@example.test', role: 'manager' } }, lookups))
      .toEqual({ subject: { text: 'alex@example.test', href: null }, detail: { kind: 'invited', email: 'alex@example.test', role: 'manager' } })
    expect(describeEntry({ action: 'auth.sign_in', entityType: null, entityId: null, details: { method: 'passkey' } }, lookups))
      .toEqual({ subject: null, detail: { kind: 'method', method: 'passkey' } })
    expect(describeEntry({ action: 'auth.password_changed', entityType: 'user', entityId: 'u1', details: { signedOut: 2 } }, lookups).detail)
      .toEqual({ kind: 'devices', count: 2 })
    expect(describeEntry({ action: 'orders.exported', entityType: null, entityId: null, details: { rows: 10000, truncated: true } }, lookups).detail)
      .toEqual({ kind: 'rows', count: 10000, truncated: true })
  })

  it('shows nothing for a malformed entry instead of failing', () => {
    expect(describeEntry({ action: 'order.status_changed', entityType: 'order', entityId: 'x', details: null }, lookups)).toEqual({ subject: null, detail: null })
    expect(describeEntry({ action: 'collection.moved', entityType: 'collection', entityId: 'c1', details: { from: '1', to: 2 } }, lookups).detail).toBeNull()
  })
})
