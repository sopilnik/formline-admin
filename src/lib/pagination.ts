import { one, type SearchParams } from '@/lib/search-params'

/** The page sizes every list offers; the first is the default. */
export const PAGE_SIZES = [25, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export const DEFAULT_PAGE_SIZE: PageSize = PAGE_SIZES[0]

/** A page number from the URL: a whole number from 1, else the first page. */
export function parsePage(value: string | undefined): number {
  const page = Number(value)

  return Number.isInteger(page) && page >= 1 ? page : 1
}

/** A page size from the URL: one of PAGE_SIZES, else the default. */
export function parsePageSize(value: string | undefined): PageSize {
  const size = Number(value)

  return (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_PAGE_SIZE
}

/** A list that pages newest first with only its page and its size in the URL: the notifications and the outbox. */
export type PageQuery = { page: number; size: PageSize }

export const DEFAULT_PAGE_QUERY: PageQuery = { page: 1, size: DEFAULT_PAGE_SIZE }

export function parsePageQuery(params: SearchParams): PageQuery {
  return { page: parsePage(one(params, 'page')), size: parsePageSize(one(params, 'size')) }
}

/** The list's path with `changes` applied: the defaults stay out, and a changed size starts again at page 1, as on the other lists. */
export function pageQueryHref(path: string, query: PageQuery, changes: Partial<PageQuery> = {}): string {
  const page = changes.page ?? (changes.size !== undefined ? 1 : query.page)
  const size = changes.size ?? query.size
  const params = new URLSearchParams()

  if (page !== DEFAULT_PAGE_QUERY.page) params.set('page', String(page))
  if (size !== DEFAULT_PAGE_QUERY.size) params.set('size', String(size))

  const text = params.toString()

  return text ? `${path}?${text}` : path
}

/** The first and the last row a page shows, counted from 1 over the rows the filters keep. */
export function pageRange(page: number, size: number, filtered: number): { from: number; to: number } {
  return { from: (page - 1) * size + 1, to: Math.min(page * size, filtered) }
}

/** How many pages `rows` fill; an empty list still has its one page. */
export function pageCount(rows: number, size: number): number {
  return Math.max(1, Math.ceil(rows / size))
}

/** The page numbers the pager shows: at most five, the current one centered where the ends allow. */
export function pageWindow(page: number, pages: number): number[] {
  const size = Math.min(5, pages)
  const start = Math.min(Math.max(1, page - 2), pages - size + 1)

  return Array.from({ length: size }, (_, i) => start + i)
}
