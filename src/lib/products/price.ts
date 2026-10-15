import type { Locale } from '@/i18n/locale'

export const SIZE_IDS = ['a3', 'a2', 'a1'] as const
export type SizeId = (typeof SIZE_IDS)[number]

/** The store's surcharges on the base price: A3 none, A2 $16, A1 $40. */
export const SIZE_SURCHARGE_CENTS: Record<SizeId, number> = { a3: 0, a2: 1600, a1: 4000 }

/** $9,999.99: the largest price a variant may have, typed as its own price or made from the base price. */
const MAX_PRICE_CENTS = 999_999

/** $9,959.99: the largest base price, so that its largest size, with the surcharge, stays within MAX_PRICE_CENTS. */
export const MAX_BASE_PRICE_CENTS = MAX_PRICE_CENTS - Math.max(...Object.values(SIZE_SURCHARGE_CENTS))

/**
 * A variant's price: its override when one is set, the base price plus the size's surcharge otherwise.
 * The products list computes the same in SQL (`variantPriceSql` in `src/server/dal/products.ts`).
 */
export function variantPriceCents(baseCents: number, size: SizeId, overrideCents: number | null): number {
  return overrideCents ?? baseCents + SIZE_SURCHARGE_CENTS[size]
}

/** A price as typed: "29", "29.5", "29.00" or "29,00" (the Russian decimal comma). Null for anything else or outside $0.01–$9,999.99. */
export function parsePrice(text: string): number | null {
  const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(text.trim())

  if (!match) {
    return null
  }

  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))

  return cents >= 1 && cents <= MAX_PRICE_CENTS ? cents : null
}

/** A base price as typed (parsePrice), at most MAX_BASE_PRICE_CENTS. */
export function parseBasePrice(text: string): number | null {
  const cents = parsePrice(text)

  return cents !== null && cents <= MAX_BASE_PRICE_CENTS ? cents : null
}

/** The text a price field starts with: "29.00" in English, "29,00" in Russian. */
export function priceField(cents: number, locale: Locale): string {
  const text = (cents / 100).toFixed(2)

  return locale === 'ru' ? text.replace('.', ',') : text
}
