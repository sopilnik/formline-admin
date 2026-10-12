// The palette's search (spec §8.10): what it sends to the server and what comes back.
import type { OrderStatus } from '@/lib/orders/status'
import type { ProductStatus } from '@/lib/products/status'

/** A term shorter than this searches nothing: one letter would match most of the catalog. */
const SEARCH_MIN = 2
/** As long as any field the search looks at is worth typing. */
export const SEARCH_MAX = 100
/** Results per group. */
export const SEARCH_LIMIT = 5

export type SearchResults = {
  orders: { number: number; customer: string; totalCents: number; status: OrderStatus }[]
  customers: { id: string; name: string; email: string }[]
  products: { slug: string; name: string; status: ProductStatus }[]
}

export const NO_RESULTS: SearchResults = { orders: [], customers: [], products: [] }

/** The term as the search uses it: trimmed, with inner runs of spaces as one; null when it is too short or too long. */
export function searchTerm(raw: string | null | undefined): string | null {
  const term = (raw ?? '').trim().replace(/\s+/g, ' ')
  const length = [...term].length
  return length >= SEARCH_MIN && length <= SEARCH_MAX ? term : null
}

/** An order number typed with or without its "#". */
export function orderNumberOf(term: string): number | null {
  const match = /^#?(\d{1,9})$/.exec(term)
  return match ? Number(match[1]) : null
}
