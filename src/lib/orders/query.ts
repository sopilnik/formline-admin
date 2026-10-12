import { isOrderStatus, ORDER_STATUSES, type OrderStatus } from '@/lib/orders/status'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, parsePage, parsePageSize, type PageSize } from '@/lib/pagination'
import { all, one, pick, searchText, type SearchParams } from '@/lib/search-params'

export const DATE_PRESETS = ['any', 'today', '7d', '30d', 'month'] as const
export const SOURCES = ['any', 'stripe', 'seed'] as const
export const ORDER_SORTS = ['placed', 'number', 'total'] as const
export type DatePreset = (typeof DATE_PRESETS)[number]
export type SourceFilter = (typeof SOURCES)[number]
export type OrderSort = (typeof ORDER_SORTS)[number]

/** The whole state of the orders list; it lives in the URL (spec §8.2, §11). */
export type OrdersQuery = {
  status: OrderStatus[]
  q: string
  placed: DatePreset
  source: SourceFilter
  sort: OrderSort
  dir: 'asc' | 'desc'
  page: number
  size: PageSize
}

/** The most orders one selection holds: a selection never leaves its page. */
export const ORDER_SELECTION_MAX = Math.max(...PAGE_SIZES)

export const DEFAULT_ORDERS_QUERY: OrdersQuery = { status: [], q: '', placed: 'any', source: 'any', sort: 'placed', dir: 'desc', page: 1, size: DEFAULT_PAGE_SIZE }

/** Tolerant: an unknown value means the default, never an error. Statuses may repeat or be comma-separated. */
export function parseOrdersQuery(params: SearchParams | URLSearchParams): OrdersQuery {
  const statuses = new Set(all(params, 'status').flatMap(v => v.split(',')).filter(isOrderStatus))
  return {
    status: ORDER_STATUSES.filter(s => statuses.has(s)),
    q: searchText(params),
    placed: pick(DATE_PRESETS, one(params, 'placed'), DEFAULT_ORDERS_QUERY.placed),
    source: pick(SOURCES, one(params, 'source'), DEFAULT_ORDERS_QUERY.source),
    sort: pick(ORDER_SORTS, one(params, 'sort'), DEFAULT_ORDERS_QUERY.sort),
    dir: pick(['asc', 'desc'] as const, one(params, 'dir'), DEFAULT_ORDERS_QUERY.dir),
    page: parsePage(one(params, 'page')),
    size: parsePageSize(one(params, 'size')),
  }
}

/** A link to the list with `changes` applied; a changed filter or sort starts again at page 1. */
export function ordersHref(query: OrdersQuery, changes: Partial<OrdersQuery> = {}): string {
  const changedKeys = Object.keys(changes) as (keyof OrdersQuery)[]
  const resetsPage = changedKeys.some(key => key !== 'page')
  const next: OrdersQuery = { ...query, ...changes, page: changes.page ?? (resetsPage ? 1 : query.page) }
  const params = new URLSearchParams()
  if (next.status.length > 0) params.set('status', ORDER_STATUSES.filter(s => next.status.includes(s)).join(','))
  if (next.q) params.set('q', next.q)
  if (next.placed !== DEFAULT_ORDERS_QUERY.placed) params.set('placed', next.placed)
  if (next.source !== DEFAULT_ORDERS_QUERY.source) params.set('source', next.source)
  if (next.sort !== DEFAULT_ORDERS_QUERY.sort) params.set('sort', next.sort)
  if (next.dir !== DEFAULT_ORDERS_QUERY.dir) params.set('dir', next.dir)
  if (next.page !== DEFAULT_ORDERS_QUERY.page) params.set('page', String(next.page))
  if (next.size !== DEFAULT_ORDERS_QUERY.size) params.set('size', String(next.size))
  const text = params.toString().replace(/%2C/g, ',')
  return text ? `/orders?${text}` : '/orders'
}

/** Whether any filter (not the sort or the page) differs from the default — the "Clear filters" link. */
export function isOrdersFiltered(query: OrdersQuery): boolean {
  return query.status.length > 0 || query.q !== '' || query.placed !== DEFAULT_ORDERS_QUERY.placed || query.source !== DEFAULT_ORDERS_QUERY.source
}

/** The CSV of the list: its filters and sort without the page, or the chosen orders in the list's sort (spec §8.2). */
export function ordersExportHref(query: OrdersQuery, ids?: readonly string[]): string {
  const href = ordersHref({ ...query, page: 1, size: DEFAULT_ORDERS_QUERY.size })
  const at = href.indexOf('?')
  const params = new URLSearchParams(at === -1 ? '' : href.slice(at + 1))
  if (ids && ids.length > 0) {
    for (const key of ['status', 'q', 'placed', 'source']) params.delete(key)
    params.set('ids', ids.join(','))
  }
  const text = params.toString().replace(/%2C/g, ',')
  return text ? `/api/orders/export?${text}` : '/api/orders/export'
}
