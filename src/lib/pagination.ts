/** The page sizes every list offers (spec §11); the first is the default. */
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

/** How many pages `rows` fill; an empty list still has its one page. */
export function pageCount(rows: number, size: number): number {
  return Math.max(1, Math.ceil(rows / size))
}

/** The page numbers the pager shows: at most five, the current one centred where the ends allow. */
export function pageWindow(page: number, pages: number): number[] {
  const size = Math.min(5, pages)
  const start = Math.min(Math.max(1, page - 2), pages - size + 1)
  return Array.from({ length: size }, (_, i) => start + i)
}
