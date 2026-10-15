import { describe, expect, it } from 'vitest'
import { notificationMessage } from '@/lib/notifications/message'
import type { NotificationView } from '@/lib/notifications/view'
import en from '../../messages/en.json'
import ru from '../../messages/ru.json'

// One view for every wording a notification can take (src/lib/notifications/message.ts).
const VIEWS: NotificationView[] = [
  { kind: 'order.created', number: 1700, customer: 'Mia Novak', totalCents: 12800 },
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

const lookup = (tree: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)

describe('notification messages', () => {
  it('only take keys both dictionaries have', () => {
    const keys = new Set(VIEWS.flatMap(view => {
      const message = notificationMessage(view, 'en', role => role)

      return [message.title.key, message.detail.key]
    }))

    expect(keys.size).toBe(20)
    for (const key of keys) {
      expect(typeof lookup(en, `notifications.kinds.${key}`), key).toBe('string')
      expect(typeof lookup(ru, `notifications.kinds.${key}`), key).toBe('string')
    }
  })
})
