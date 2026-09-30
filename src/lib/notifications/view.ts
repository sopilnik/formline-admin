// The kinds of notification the bell shows (spec §8.9) and what each one says. The payload is
// written when the event happens and kept as it was, so a later rename does not rewrite history.

export const NOTIFICATION_KINDS = [
  'order.created',
  'stock.low',
  'team.invitation_accepted',
  'auth.new_sign_in',
  'auth.second_factor_locked',
  'auth.recovery_code_used',
] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export type NotificationView =
  | { kind: 'order.created'; number: number | null; customer: string | null; totalCents: number | null }
  | { kind: 'stock.low'; product: string; size: string; palette: string; stock: number; threshold: number | null; oversold: number | null }
  | { kind: 'team.invitation_accepted'; person: string; role: string | null }
  | { kind: 'auth.new_sign_in'; device: string | null }
  | { kind: 'auth.second_factor_locked' }
  | { kind: 'auth.recovery_code_used'; remaining: number | null }

/** One notification as the bell and the page show it, in the reader's language and the store's time zone. */
export type NotificationItem = { id: string; kind: NotificationKind; title: string; detail: string; time: string; read: boolean; thisDevice: boolean }

/** Where a notification leads; a product is found by its id when it is opened, since its slug can change. */
export type NotificationTarget =
  | { type: 'order'; number: number }
  | { type: 'product'; productId: string }
  | { type: 'page'; href: '/team' | '/settings/security' }

type Payload = Record<string, unknown>

const text = (payload: Payload, key: string): string | null => {
  const value = payload[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const whole = (payload: Payload, key: string): number | null => {
  const value = payload[key]
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value)
}

/** What a stored notification says; null for a kind this version does not know, which the lists leave out. */
export function notificationView(kind: string, stored: unknown): NotificationView | null {
  const payload: Payload = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Payload) : {}
  switch (kind) {
    case 'order.created':
      return { kind, number: whole(payload, 'number'), customer: text(payload, 'customer'), totalCents: whole(payload, 'totalCents') }
    case 'stock.low': {
      const stock = whole(payload, 'stock') ?? 0
      return {
        kind,
        product: text(payload, 'product') ?? '—',
        size: text(payload, 'size') ?? '',
        palette: text(payload, 'palette') ?? '',
        stock: Math.max(stock, 0),
        threshold: whole(payload, 'threshold'),
        oversold: whole(payload, 'oversold'),
      }
    }
    case 'team.invitation_accepted':
      return { kind, person: text(payload, 'name') ?? '—', role: text(payload, 'role') }
    case 'auth.new_sign_in':
      return { kind, device: text(payload, 'device') }
    case 'auth.second_factor_locked':
      return { kind }
    case 'auth.recovery_code_used':
      return { kind, remaining: whole(payload, 'remaining') }
    default:
      return null
  }
}

/** The subject a notification opens; null when the payload names none (the notifications page then stays open). */
export function notificationTarget(kind: string, stored: unknown): NotificationTarget | null {
  const payload: Payload = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Payload) : {}
  switch (kind) {
    case 'order.created': {
      const number = whole(payload, 'number')
      return number !== null && number > 0 ? { type: 'order', number } : null
    }
    case 'stock.low': {
      const productId = text(payload, 'productId')
      return productId && UUID.test(productId) ? { type: 'product', productId } : null
    }
    case 'team.invitation_accepted':
      return { type: 'page', href: '/team' }
    case 'auth.new_sign_in':
    case 'auth.second_factor_locked':
    case 'auth.recovery_code_used':
      return { type: 'page', href: '/settings/security' }
    default:
      return null
  }
}
