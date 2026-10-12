import type { Locale } from '@/i18n/locale'
import { formatDateTime, formatMoney } from '@/lib/intl'
import type { OrderStatus } from '@/lib/orders/status'
import type { OrderRow } from '@/server/dal/orders'

/** One row of the list as the client components receive it: strings formatted on the server, in the store's zone. */
export type OrderRowView = {
  id: string; number: number; href: string; placed: string; customerName: string; customerEmail: string
  items: number; total: string; status: OrderStatus; source: 'seed' | 'stripe'
}

/** The order page is addressed by the number people quote (amendment 3). */
export function orderHref(number: number): string {
  return `/orders/${number}`
}

export function toOrderRowView(row: OrderRow, locale: Locale, timeZone: string): OrderRowView {
  return {
    id: row.id,
    number: row.number,
    href: orderHref(row.number),
    placed: formatDateTime(row.placedAt, locale, timeZone),
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    items: row.items,
    total: formatMoney(row.totalCents, locale),
    status: row.status,
    source: row.source,
  }
}
