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

export function toRowView(row: OrderRow, locale: Locale, timeZone: string): OrderRowView {
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

/** The page numbers the pager shows: at most five, the current one centred where the ends allow. */
export function pageWindow(page: number, pages: number): number[] {
  const size = Math.min(5, pages)
  const start = Math.min(Math.max(1, page - 2), pages - size + 1)
  return Array.from({ length: size }, (_, i) => start + i)
}
