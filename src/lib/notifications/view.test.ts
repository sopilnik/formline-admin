import { describe, expect, it } from 'vitest'
import { NOTIFICATION_KINDS, notificationTarget, notificationView } from '@/lib/notifications/view'

const PRODUCT = '0b6f3c1e-8d2a-4b7e-9f10-2a3b4c5d6e7f'

describe('notification kinds', () => {
  it('are the six the panel writes', () => {
    expect([...NOTIFICATION_KINDS].sort()).toEqual([
      'auth.new_sign_in', 'auth.recovery_code_used', 'auth.second_factor_locked', 'order.created', 'stock.low', 'team.invitation_accepted',
    ])
  })
})

describe('notificationView', () => {
  it('reads what each kind stored', () => {
    expect(notificationView('order.created', { orderId: PRODUCT, number: 1700, customer: 'Mia Novak', totalCents: 12800 }))
      .toEqual({ kind: 'order.created', number: 1700, customer: 'Mia Novak', totalCents: 12800 })
    expect(notificationView('stock.low', { productId: PRODUCT, product: 'Far Orbit', size: 'a2', palette: 'ink', stock: 1, threshold: 3 }))
      .toEqual({ kind: 'stock.low', product: 'Far Orbit', size: 'a2', palette: 'ink', stock: 1, threshold: 3, oversold: null })
    expect(notificationView('stock.low', { product: 'Loud', size: 'a1', palette: 'ocean', stock: 0, threshold: 3, oversold: 2 }))
      .toMatchObject({ stock: 0, oversold: 2 })
    expect(notificationView('team.invitation_accepted', { name: 'Lena Park', role: 'manager' }))
      .toEqual({ kind: 'team.invitation_accepted', person: 'Lena Park', role: 'manager' })
    expect(notificationView('auth.new_sign_in', { device: 'Firefox, Linux', at: '2026-09-30T10:00:00Z', signIn: PRODUCT }))
      .toEqual({ kind: 'auth.new_sign_in', device: 'Firefox, Linux' })
    expect(notificationView('auth.second_factor_locked', {})).toEqual({ kind: 'auth.second_factor_locked' })
    expect(notificationView('auth.recovery_code_used', { remaining: 9 })).toEqual({ kind: 'auth.recovery_code_used', remaining: 9 })
  })

  it('stands missing or malformed fields in, and leaves an unknown kind out', () => {
    expect(notificationView('order.created', { number: '1700', customer: '  ' })).toEqual({ kind: 'order.created', number: null, customer: null, totalCents: null })
    expect(notificationView('stock.low', null)).toEqual({ kind: 'stock.low', product: '—', size: '', palette: '', stock: 0, threshold: null, oversold: null })
    expect(notificationView('stock.low', { stock: -2 })).toMatchObject({ stock: 0 })
    expect(notificationView('team.invitation_accepted', [])).toEqual({ kind: 'team.invitation_accepted', person: '—', role: null })
    expect(notificationView('auth.recovery_code_used', { remaining: 2.5 })).toEqual({ kind: 'auth.recovery_code_used', remaining: null })
    expect(notificationView('order.new', {})).toBeNull()
  })
})

describe('notificationTarget', () => {
  it('opens the order, the product by its id, the team or the security page', () => {
    expect(notificationTarget('order.created', { number: 1700 })).toEqual({ type: 'order', number: 1700 })
    expect(notificationTarget('stock.low', { productId: PRODUCT })).toEqual({ type: 'product', productId: PRODUCT })
    expect(notificationTarget('team.invitation_accepted', {})).toEqual({ type: 'page', href: '/team' })
    for (const kind of ['auth.new_sign_in', 'auth.second_factor_locked', 'auth.recovery_code_used']) {
      expect(notificationTarget(kind, {})).toEqual({ type: 'page', href: '/settings/security' })
    }
  })

  it('opens nothing it cannot name', () => {
    expect(notificationTarget('order.created', { number: 0 })).toBeNull()
    expect(notificationTarget('order.created', {})).toBeNull()
    expect(notificationTarget('stock.low', { productId: 'not-a-uuid' })).toBeNull()
    expect(notificationTarget('order.new', { number: 1 })).toBeNull()
  })
})
