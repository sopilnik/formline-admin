import { DEFAULT_PAGE_SIZE, parsePage, parsePageSize, type PageSize } from '@/lib/pagination'
import { one, pick, searchText, type SearchParams } from '@/lib/search-params'

export const CUSTOMER_SORTS = ['name', 'orders', 'spent', 'last'] as const
export type CustomerSort = (typeof CUSTOMER_SORTS)[number]

/** The whole state of the customers list; it lives in the URL, as on the orders and the products (spec §8.5, §11). */
export type CustomersQuery = {
  q: string
  sort: CustomerSort
  dir: 'asc' | 'desc'
  page: number
  size: PageSize
}

/** The latest order first: the customers someone is most likely looking for. */
export const DEFAULT_CUSTOMERS_QUERY: CustomersQuery = { q: '', sort: 'last', dir: 'desc', page: 1, size: DEFAULT_PAGE_SIZE }

/** The direction a column starts in: names A to Z, the most orders, the most spent and the latest order first. */
export const FIRST_DIR: Record<CustomerSort, 'asc' | 'desc'> = { name: 'asc', orders: 'desc', spent: 'desc', last: 'desc' }

/** Tolerant, as the other lists: an unknown value means the default. */
export function parseCustomersQuery(params: SearchParams | URLSearchParams): CustomersQuery {
  const sort = pick(CUSTOMER_SORTS, one(params, 'sort'), DEFAULT_CUSTOMERS_QUERY.sort)
  return {
    q: searchText(params),
    sort,
    dir: pick(['asc', 'desc'] as const, one(params, 'dir'), FIRST_DIR[sort]),
    page: parsePage(one(params, 'page')),
    size: parsePageSize(one(params, 'size')),
  }
}

/** The list's query string with `changes` applied: defaults stay out, and a changed search, sort or size starts again at page 1. */
function customersParams(query: CustomersQuery, changes: Partial<CustomersQuery>): URLSearchParams {
  const resetsPage = Object.keys(changes).some(key => key !== 'page')
  const next: CustomersQuery = { ...query, ...changes, page: changes.page ?? (resetsPage ? 1 : query.page) }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.sort !== DEFAULT_CUSTOMERS_QUERY.sort) params.set('sort', next.sort)
  if (next.dir !== FIRST_DIR[next.sort]) params.set('dir', next.dir)
  if (next.page !== DEFAULT_CUSTOMERS_QUERY.page) params.set('page', String(next.page))
  if (next.size !== DEFAULT_CUSTOMERS_QUERY.size) params.set('size', String(next.size))
  return params
}

export function customersHref(query: CustomersQuery, changes: Partial<CustomersQuery> = {}): string {
  const text = customersParams(query, changes).toString()
  return text ? `/customers?${text}` : '/customers'
}

/** Whether the search is on (the sort and the page are not filters) — the "Clear search" link. */
export function isCustomersFiltered(query: CustomersQuery): boolean {
  return query.q !== ''
}

/** The CSV of the list: its search and sort, without the page (spec §8.5). */
export function customersExportHref(query: CustomersQuery): string {
  const params = customersParams({ ...query, page: 1, size: DEFAULT_CUSTOMERS_QUERY.size }, {})
  const text = params.toString()
  return text ? `/api/customers/export?${text}` : '/api/customers/export'
}
