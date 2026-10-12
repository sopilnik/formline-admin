import type { Locale } from '@/i18n/locale'
import { countryName, formatDate, formatMoney, formatNumber } from '@/lib/intl'

/** One row of the customers list as the database gives it. */
export type CustomerRow = {
  id: string; name: string; email: string; city: string | null; country: string | null
  /** Every order of the customer, whatever its status. */
  orders: number
  /** The orders that count as revenue (paid, processing, shipped, delivered), as the overview counts them. */
  spentCents: number
  lastOrderAt: Date | null
}

/** One row of the customers list as the components receive it: strings formatted on the server, in the store's zone. */
export type CustomerRowView = {
  id: string; href: string; name: string; email: string
  /** "Berlin, Germany"; null when neither is known. */
  location: string | null
  orders: number; ordersText: string; spent: string
  /** The date of the latest order; null for a customer without orders. */
  last: string | null
}

/** A customer is addressed by id (spec §11): names repeat, emails are personal data in an address bar. */
export function customerHref(id: string): string {
  return `/customers/${id}`
}

/** The city and the country's name in the interface language ("Berlin, Germany", "Берлин, Германия"). */
export function locationOf(city: string | null, country: string | null, locale: Locale): string | null {
  const parts = [city, country ? countryName(country, locale) : null].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(', ') : null
}

export function toCustomerRowView(row: CustomerRow, locale: Locale, timeZone: string): CustomerRowView {
  return {
    id: row.id,
    href: customerHref(row.id),
    name: row.name,
    email: row.email,
    location: locationOf(row.city, row.country, locale),
    orders: row.orders,
    ordersText: formatNumber(row.orders, locale),
    spent: formatMoney(row.spentCents, locale),
    last: row.lastOrderAt ? formatDate(row.lastOrderAt, locale, timeZone) : null,
  }
}
