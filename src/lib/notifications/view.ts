// The kinds of notification the bell shows and what each one says. The payload is
// written when the event happens and kept as it was, so a later rename does not rewrite history.
import { asRecord, text, UUID_PATTERN, whole } from '@/lib/payload'

export const NOTIFICATION_KINDS = [
  'order.created',
  'stock.low',
  'team.invitation_accepted',
  'auth.new_sign_in',
  'auth.second_factor_locked',
  'auth.recovery_code_used',
] as const
// The bell's badge shows at most this many unread notifications, and "99+" beyond it.
const BADGE_MAX = 99

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

/** What a stored notification says; null for a kind this version does not know, which the lists leave out. */
export function notificationView(kind: string, stored: unknown): NotificationView | null {
  const payload = asRecord(stored) ?? {}

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
  const payload = asRecord(stored) ?? {}

  switch (kind) {
    case 'order.created': {
      const number = whole(payload, 'number')

      return number !== null && number > 0 ? { type: 'order', number } : null
    }
    case 'stock.low': {
      const productId = text(payload, 'productId')

      return productId && UUID_PATTERN.test(productId) ? { type: 'product', productId } : null
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

/**
 * What the bell's badge shows for `unread`, and the count its name takes the plural form from: the name must contain
 * what the badge shows, and 100 picks the form that reads with "99+" in both languages.
 */
export function bellBadge(unread: number): { shown: string; count: number } {
  if (unread > BADGE_MAX) {
    return { shown: `${BADGE_MAX}+`, count: BADGE_MAX + 1 }
  }

  return { shown: String(unread), count: unread }
}
