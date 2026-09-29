import type { Locale } from '@/i18n/locale'
import { imageSrc } from '@/lib/catalog'
import { formatDate, formatMoney, formatNumber } from '@/lib/intl'
import type { ProductStatus } from '@/lib/products/status'
import type { ProductRow } from '@/server/dal/products'

/** One row of the products list as the components receive it: strings formatted on the server, in the store's zone. */
export type ProductRowView = {
  id: string; href: string; name: string; status: ProductStatus; collection: string; imageSrc: string | null
  /** The cheapest variant's price, or null for a product without variants. */
  priceFrom: string | null
  stock: string; soldOut: number; low: number; updated: string
}

/** The product page is addressed by its slug (spec §8.3), which the list links to. */
export function productHref(slug: string): string {
  return `/products/${slug}`
}

export function toProductRowView(row: ProductRow, locale: Locale, timeZone: string): ProductRowView {
  return {
    id: row.id,
    href: productHref(row.slug),
    name: row.name,
    status: row.status,
    collection: row.collection.name,
    imageSrc: row.image ? imageSrc(row.image) : null,
    priceFrom: row.priceFromCents === null ? null : formatMoney(row.priceFromCents, locale),
    stock: formatNumber(row.stock, locale),
    soldOut: row.soldOut,
    // The low count holds the sold-out variants too; the list names them apart.
    low: row.low - row.soldOut,
    updated: formatDate(row.updatedAt, locale, timeZone),
  }
}
