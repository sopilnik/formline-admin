import { DEFAULT_PAGE_SIZE, parsePage, parsePageSize, type PageSize } from '@/lib/pagination'

/** The notifications page pages newest first; only the page and its size live in the URL. */
export type NotificationsQuery = { page: number; size: PageSize }

export const DEFAULT_NOTIFICATIONS_QUERY: NotificationsQuery = { page: 1, size: DEFAULT_PAGE_SIZE }

export type SearchParams = Record<string, string | string[] | undefined>

const one = (params: SearchParams, key: string): string | undefined => {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

export function parseNotificationsQuery(params: SearchParams): NotificationsQuery {
  return { page: parsePage(one(params, 'page')), size: parsePageSize(one(params, 'size')) }
}

/** A changed size starts again at page 1, as on the other lists. */
export function notificationsHref(query: NotificationsQuery, changes: Partial<NotificationsQuery> = {}): string {
  const page = changes.page ?? (changes.size !== undefined ? 1 : query.page)
  const size = changes.size ?? query.size
  const params = new URLSearchParams()
  if (page !== DEFAULT_NOTIFICATIONS_QUERY.page) params.set('page', String(page))
  if (size !== DEFAULT_NOTIFICATIONS_QUERY.size) params.set('size', String(size))
  const text = params.toString()
  return text ? `/notifications?${text}` : '/notifications'
}
