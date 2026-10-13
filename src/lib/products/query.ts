import { DEFAULT_PAGE_SIZE, parsePage, parsePageSize, type PageSize } from '@/lib/pagination'
import { isProductStatus, PRODUCT_STATUSES, type ProductStatus } from '@/lib/products/status'
import { all, one, pick, searchText, type SearchParams } from '@/lib/search-params'
import { SLUG_PATTERN } from '@/lib/slug'

export const STOCK_FILTERS = ['any', 'low', 'out'] as const
export const PRODUCT_SORTS = ['name', 'price', 'stock', 'updated'] as const
export type StockFilter = (typeof STOCK_FILTERS)[number]
export type ProductSort = (typeof PRODUCT_SORTS)[number]

/** The whole state of the products list; it lives in the URL. */
export type ProductsQuery = {
  status: ProductStatus[]
  q: string
  /** A collection's slug; '' for every collection. */
  collection: string
  stock: StockFilter
  sort: ProductSort
  dir: 'asc' | 'desc'
  page: number
  size: PageSize
}

export const DEFAULT_PRODUCTS_QUERY: ProductsQuery = {
  status: [], q: '', collection: '', stock: 'any', sort: 'name', dir: 'asc', page: 1, size: DEFAULT_PAGE_SIZE,
}

/** The direction a column starts in: names A to Z, the cheapest and the emptiest first, the latest change first. */
export const FIRST_DIR: Record<ProductSort, 'asc' | 'desc'> = { name: 'asc', price: 'asc', stock: 'asc', updated: 'desc' }

/** Tolerant, as the orders list: an unknown value means the default. Statuses may repeat or be comma-separated. */
export function parseProductsQuery(params: SearchParams | URLSearchParams): ProductsQuery {
  const statuses = new Set(all(params, 'status').flatMap(v => v.split(',')).filter(isProductStatus))
  const collection = one(params, 'collection') ?? ''
  const sort = pick(PRODUCT_SORTS, one(params, 'sort'), DEFAULT_PRODUCTS_QUERY.sort)
  return {
    status: PRODUCT_STATUSES.filter(s => statuses.has(s)),
    q: searchText(params),
    collection: SLUG_PATTERN.test(collection) ? collection : '',
    stock: pick(STOCK_FILTERS, one(params, 'stock'), DEFAULT_PRODUCTS_QUERY.stock),
    sort,
    dir: pick(['asc', 'desc'] as const, one(params, 'dir'), FIRST_DIR[sort]),
    page: parsePage(one(params, 'page')),
    size: parsePageSize(one(params, 'size')),
  }
}

/**
 * A link to the list with `changes` applied; values equal to the defaults stay out of the URL,
 * and a changed filter, sort or page size starts again at page 1.
 */
export function productsHref(query: ProductsQuery, changes: Partial<ProductsQuery> = {}): string {
  const resetsPage = Object.keys(changes).some(key => key !== 'page')
  const next: ProductsQuery = { ...query, ...changes, page: changes.page ?? (resetsPage ? 1 : query.page) }
  const params = new URLSearchParams()
  if (next.status.length > 0) params.set('status', PRODUCT_STATUSES.filter(s => next.status.includes(s)).join(','))
  if (next.q) params.set('q', next.q)
  if (next.collection) params.set('collection', next.collection)
  if (next.stock !== DEFAULT_PRODUCTS_QUERY.stock) params.set('stock', next.stock)
  if (next.sort !== DEFAULT_PRODUCTS_QUERY.sort) params.set('sort', next.sort)
  if (next.dir !== FIRST_DIR[next.sort]) params.set('dir', next.dir)
  if (next.page !== DEFAULT_PRODUCTS_QUERY.page) params.set('page', String(next.page))
  if (next.size !== DEFAULT_PRODUCTS_QUERY.size) params.set('size', String(next.size))
  const text = params.toString().replace(/%2C/g, ',')
  return text ? `/products?${text}` : '/products'
}

/** Whether any filter (not the sort or the page) differs from the default — the "Clear filters" link. */
export function isProductsFiltered(query: ProductsQuery): boolean {
  return query.status.length > 0 || query.q !== '' || query.collection !== '' || query.stock !== DEFAULT_PRODUCTS_QUERY.stock
}
