import { isOrderStatus, ORDER_STATUSES, type OrderStatus } from '@/lib/orders/status'

export const PAGE_SIZES = [25, 50, 100] as const
export const DATE_PRESETS = ['any', 'today', '7d', '30d', 'month'] as const
export const SOURCES = ['any', 'stripe', 'seed'] as const
export const SORT_KEYS = ['placed', 'number', 'total'] as const
export type PageSize = (typeof PAGE_SIZES)[number]
export type DatePreset = (typeof DATE_PRESETS)[number]
export type SourceFilter = (typeof SOURCES)[number]
export type SortKey = (typeof SORT_KEYS)[number]

/** The whole state of the orders list; it lives in the URL (spec §8.2, §11). */
export type OrdersQuery = {
  status: OrderStatus[]
  q: string
  placed: DatePreset
  source: SourceFilter
  sort: SortKey
  dir: 'asc' | 'desc'
  page: number
  size: PageSize
}

export const DEFAULT_QUERY: OrdersQuery = { status: [], q: '', placed: 'any', source: 'any', sort: 'placed', dir: 'desc', page: 1, size: 25 }
const MAX_SEARCH = 100

export type SearchParams = Record<string, string | string[] | undefined>

function all(params: SearchParams | URLSearchParams, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key)
  const value = params[key]
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

const one = (params: SearchParams | URLSearchParams, key: string): string | undefined => all(params, key)[0]

function pick<T extends string>(options: readonly T[], value: string | undefined, fallback: T): T {
  return value !== undefined && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Tolerant: an unknown value means the default, never an error. Statuses may repeat or be comma-separated. */
export function parseOrdersQuery(params: SearchParams | URLSearchParams): OrdersQuery {
  const statuses = new Set(all(params, 'status').flatMap(v => v.split(',')).filter(isOrderStatus))
  const page = Number(one(params, 'page'))
  const size = Number(one(params, 'size'))
  return {
    status: ORDER_STATUSES.filter(s => statuses.has(s)),
    q: (one(params, 'q') ?? '').trim().slice(0, MAX_SEARCH),
    placed: pick(DATE_PRESETS, one(params, 'placed'), DEFAULT_QUERY.placed),
    source: pick(SOURCES, one(params, 'source'), DEFAULT_QUERY.source),
    sort: pick(SORT_KEYS, one(params, 'sort'), DEFAULT_QUERY.sort),
    dir: pick(['asc', 'desc'] as const, one(params, 'dir'), DEFAULT_QUERY.dir),
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_QUERY.page,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? (size as PageSize) : DEFAULT_QUERY.size,
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
  if (next.placed !== DEFAULT_QUERY.placed) params.set('placed', next.placed)
  if (next.source !== DEFAULT_QUERY.source) params.set('source', next.source)
  if (next.sort !== DEFAULT_QUERY.sort) params.set('sort', next.sort)
  if (next.dir !== DEFAULT_QUERY.dir) params.set('dir', next.dir)
  if (next.page !== DEFAULT_QUERY.page) params.set('page', String(next.page))
  if (next.size !== DEFAULT_QUERY.size) params.set('size', String(next.size))
  const text = params.toString().replace(/%2C/g, ',')
  return text ? `/orders?${text}` : '/orders'
}

/** Whether any filter (not the sort or the page) differs from the default — the "Clear filters" link. */
export function isFiltered(query: OrdersQuery): boolean {
  return query.status.length > 0 || query.q !== '' || query.placed !== DEFAULT_QUERY.placed || query.source !== DEFAULT_QUERY.source
}
