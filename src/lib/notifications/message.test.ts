import { describe, expect, it } from 'vitest'
import { notificationMessage } from '@/lib/notifications/message'
import type { NotificationView } from '@/lib/notifications/view'

const roleName = (role: string) => `role:${role}`

const VIEWS: NotificationView[] = [
  { kind: 'order.created', number: 1700, customer: 'Mia Novak', totalCents: 12800 },
  { kind: 'order.created', number: null, customer: null, totalCents: null },
  { kind: 'stock.low', product: 'Far Orbit', size: 'a2', palette: 'ink', stock: 1, threshold: 3, oversold: null },
  { kind: 'stock.low', product: 'Far Orbit', size: 'a2', palette: 'ink', stock: 1, threshold: null, oversold: null },
  { kind: 'stock.low', product: 'Loud', size: 'a1', palette: 'ocean', stock: 0, threshold: 3, oversold: null },
  { kind: 'stock.low', product: 'Loud', size: 'a1', palette: 'ocean', stock: 0, threshold: 3, oversold: 2 },
  { kind: 'team.invitation_accepted', person: 'Lena Park', role: 'manager' },
  { kind: 'team.invitation_accepted', person: 'Lena Park', role: null },
  { kind: 'auth.new_sign_in', device: 'Firefox, Linux' },
  { kind: 'auth.new_sign_in', device: null },
  { kind: 'auth.second_factor_locked' },
  { kind: 'auth.recovery_code_used', remaining: 9 },
  { kind: 'auth.recovery_code_used', remaining: null },
]

describe('notificationMessage', () => {
  it('names an order with its number, customer and total in the reader\'s language', () => {
    expect(notificationMessage(VIEWS[0]!, 'en', roleName)).toEqual({
      title: { key: 'order.title', values: { number: 1700 } },
      detail: { key: 'order.detail', values: { customer: 'Mia Novak', total: '$128.00' } },
    })
    expect(notificationMessage(VIEWS[0]!, 'ru', roleName).detail.values.total).toBe('128,00\u00a0$')
    expect(notificationMessage(VIEWS[1]!, 'en', roleName).detail.values).toEqual({ customer: '—', total: '—' })
  })

  it('tells low stock, sold out and oversold apart', () => {
    expect(notificationMessage(VIEWS[2]!, 'en', roleName)).toEqual({
      title: { key: 'lowStock.title', values: { product: 'Far Orbit' } },
      detail: { key: 'lowStock.detail', values: { variant: 'A2 · Ink', stock: 1, threshold: 3 } },
    })
    expect(notificationMessage(VIEWS[3]!, 'en', roleName).detail.key).toBe('lowStock.left')
    expect(notificationMessage(VIEWS[4]!, 'en', roleName).title.key).toBe('soldOut.title')
    expect(notificationMessage(VIEWS[5]!, 'en', roleName)).toEqual({
      title: { key: 'oversold.title', values: { product: 'Loud' } },
      detail: { key: 'oversold.detail', values: { variant: 'A1 · Ocean', count: 2 } },
    })
  })

  it('names the new member\'s role, the device and the codes left', () => {
    expect(notificationMessage(VIEWS[6]!, 'en', roleName).detail).toEqual({ key: 'joined.detail', values: { role: 'role:manager' } })
    expect(notificationMessage(VIEWS[7]!, 'en', roleName).detail.key).toBe('joined.noRole')
    expect(notificationMessage(VIEWS[8]!, 'en', roleName).detail).toEqual({ key: 'signIn.detail', values: { device: 'Firefox, Linux' } })
    expect(notificationMessage(VIEWS[9]!, 'en', roleName).detail.key).toBe('signIn.noDevice')
    expect(notificationMessage(VIEWS[11]!, 'en', roleName).detail).toEqual({ key: 'recovery.detail', values: { remaining: 9 } })
    expect(notificationMessage(VIEWS[12]!, 'en', roleName).detail.key).toBe('recovery.detailUnknown')
  })
})
