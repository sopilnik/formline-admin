import type { Locale } from '@/i18n/locale'
import { variantLabel } from '@/lib/catalog'
import { formatMoney } from '@/lib/intl'
import type { NotificationView } from '@/lib/notifications/view'

/** Every key under `notifications.kinds` a notification can take. */
export type MessageKey =
  | 'order.title' | 'order.detail'
  | 'lowStock.title' | 'lowStock.detail' | 'lowStock.left' | 'soldOut.title' | 'soldOut.detail' | 'oversold.title' | 'oversold.detail'
  | 'joined.title' | 'joined.detail' | 'joined.noRole'
  | 'signIn.title' | 'signIn.detail' | 'signIn.noDevice'
  | 'locked.title' | 'locked.detail'
  | 'recovery.title' | 'recovery.detail' | 'recovery.detailUnknown'

export type MessagePart = { key: MessageKey; values: Record<string, string | number> }
export type NotificationMessage = { title: MessagePart; detail: MessagePart }

const DASH = '—'

/**
 * Which words a notification takes: the page and the bell translate the keys. Money is formatted in the
 * reader's language, and a role takes its name from `roleName`.
 */
export function notificationMessage(view: NotificationView, locale: Locale, roleName: (role: string) => string): NotificationMessage {
  switch (view.kind) {
    case 'order.created':
      return {
        title: { key: 'order.title', values: { number: view.number ?? DASH } },
        detail: {
          key: 'order.detail',
          values: { customer: view.customer ?? DASH, total: view.totalCents === null ? DASH : formatMoney(view.totalCents, locale) },
        },
      }

    case 'stock.low': {
      const variant = variantLabel(view.size, view.palette)

      if (view.oversold !== null && view.oversold > 0) {
        return { title: { key: 'oversold.title', values: { product: view.product } }, detail: { key: 'oversold.detail', values: { variant, count: view.oversold } } }
      }
      if (view.stock === 0) {
        return { title: { key: 'soldOut.title', values: { product: view.product } }, detail: { key: 'soldOut.detail', values: { variant } } }
      }

      return {
        title: { key: 'lowStock.title', values: { product: view.product } },
        detail: view.threshold === null
          ? { key: 'lowStock.left', values: { variant, stock: view.stock } }
          : { key: 'lowStock.detail', values: { variant, stock: view.stock, threshold: view.threshold } },
      }
    }

    case 'team.invitation_accepted':
      return {
        title: { key: 'joined.title', values: { person: view.person } },
        detail: view.role ? { key: 'joined.detail', values: { role: roleName(view.role) } } : { key: 'joined.noRole', values: {} },
      }

    case 'auth.new_sign_in':
      return {
        title: { key: 'signIn.title', values: {} },
        detail: view.device ? { key: 'signIn.detail', values: { device: view.device } } : { key: 'signIn.noDevice', values: {} },
      }

    case 'auth.second_factor_locked':
      return { title: { key: 'locked.title', values: {} }, detail: { key: 'locked.detail', values: {} } }
    case 'auth.recovery_code_used':
      return {
        title: { key: 'recovery.title', values: {} },
        detail: view.remaining === null ? { key: 'recovery.detailUnknown', values: {} } : { key: 'recovery.detail', values: { remaining: view.remaining } },
      }
  }
}
