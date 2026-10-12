import { isActivityAction, type ActivityAction } from '@/lib/activity/actions'
import { DATE_PRESETS, type DatePreset } from '@/lib/orders/query'
import { DEFAULT_PAGE_SIZE, parsePage, parsePageSize, type PageSize } from '@/lib/pagination'
import { one, type SearchParams } from '@/lib/search-params'

/** Entries without a person: the Stripe ingest and the seed (spec §8.2, "System"). */
export const SYSTEM_ACTOR = 'system'

/** The whole state of the activity log (spec §8.7); it lives in the URL, as on the other lists. Newest first, always. */
export type ActivityQuery = {
  /** '' for everyone, SYSTEM_ACTOR, or a member's id. */
  actor: string
  action: ActivityAction | ''
  /** The date presets of the orders list, in the store's zone. */
  when: DatePreset
  page: number
  size: PageSize
}

export const DEFAULT_ACTIVITY_QUERY: ActivityQuery = { actor: '', action: '', when: 'any', page: 1, size: DEFAULT_PAGE_SIZE }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Tolerant, as the other lists: an unknown value means the default. */
export function parseActivityQuery(params: SearchParams | URLSearchParams): ActivityQuery {
  const actor = one(params, 'actor') ?? ''
  const action = one(params, 'action') ?? ''
  const when = one(params, 'when') ?? ''
  return {
    actor: actor === SYSTEM_ACTOR || UUID.test(actor) ? actor : '',
    action: isActivityAction(action) ? action : '',
    when: (DATE_PRESETS as readonly string[]).includes(when) ? (when as DatePreset) : DEFAULT_ACTIVITY_QUERY.when,
    page: parsePage(one(params, 'page')),
    size: parsePageSize(one(params, 'size')),
  }
}

/** A link to the log with `changes` applied: defaults stay out, and a changed filter or size starts again at page 1. */
export function activityHref(query: ActivityQuery, changes: Partial<ActivityQuery> = {}): string {
  const resetsPage = Object.keys(changes).some(key => key !== 'page')
  const next: ActivityQuery = { ...query, ...changes, page: changes.page ?? (resetsPage ? 1 : query.page) }
  const params = new URLSearchParams()
  if (next.actor) params.set('actor', next.actor)
  if (next.action) params.set('action', next.action)
  if (next.when !== DEFAULT_ACTIVITY_QUERY.when) params.set('when', next.when)
  if (next.page !== DEFAULT_ACTIVITY_QUERY.page) params.set('page', String(next.page))
  if (next.size !== DEFAULT_ACTIVITY_QUERY.size) params.set('size', String(next.size))
  const text = params.toString()
  return text ? `/activity?${text}` : '/activity'
}

export function isActivityFiltered(query: ActivityQuery): boolean {
  return query.actor !== '' || query.action !== '' || query.when !== DEFAULT_ACTIVITY_QUERY.when
}
