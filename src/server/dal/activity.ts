import 'server-only'
import { and, count, desc, eq, gte, inArray, isNull, lt, type SQL } from 'drizzle-orm'
import type { ActivityAction } from '@/lib/activity/actions'
import type { Lookups } from '@/lib/activity/describe'
import { SYSTEM_ACTOR, type ActivityQuery } from '@/lib/activity/query'
import { compareNames } from '@/lib/intl'
import { pageCount } from '@/lib/pagination'
import { UUID_PATTERN } from '@/lib/payload'
import { presetRange } from '@/lib/periods'
import { activityLog, collections, customers, orders, products, users } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type ActivityEntry = {
  actorUserId: string | null
  action: ActivityAction
  entityType?: string
  entityId?: string
  details?: Record<string, unknown>
  ipHash?: string | null
}

/** Security and data events. Every role appends; owners and admins read. */
export async function logActivity(tx: Tx, workspaceId: string, entry: ActivityEntry): Promise<void> {
  await tx.insert(activityLog).values({
    workspaceId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    details: entry.details ?? {},
    ipHash: entry.ipHash ?? null,
  })
}

export type ActivityRow = {
  id: string; at: Date; action: string; actorUserId: string | null
  entityType: string | null; entityId: string | null; details: unknown
}

export type ActivityPage = {
  rows: ActivityRow[]
  /** Every entry of the workspace, and the ones the filters keep. */
  total: number; filtered: number
  page: number; pages: number
  /** The members, for the actor filter and the names on the page. */
  members: { id: string; name: string }[]
  lookups: Lookups
}

export type ActivityRequest = { query: ActivityQuery; now: Date; timeZone: string }

function activityFilters(workspaceId: string, { query, now, timeZone }: ActivityRequest): SQL {
  const parts: SQL[] = [eq(activityLog.workspaceId, workspaceId)]

  if (query.actor === SYSTEM_ACTOR) {
    parts.push(isNull(activityLog.actorUserId))
  } else if (query.actor) {
    parts.push(eq(activityLog.actorUserId, query.actor))
  }
  if (query.action) {
    parts.push(eq(activityLog.action, query.action))
  }

  const range = presetRange(query.when, now, timeZone)

  if (range) {
    parts.push(gte(activityLog.at, range.start), lt(activityLog.at, range.end))
  }

  return and(...parts)!
}

/** The ids of the page's entities of one type: entity ids are text, and only uuids can name a row. */
const idsOf = (rows: ActivityRow[], type: string): string[] =>
  [...new Set(rows.flatMap(row => (row.entityType === type && row.entityId && UUID_PATTERN.test(row.entityId) ? [row.entityId] : [])))]

/**
 * One page of the activity log, newest first, filtered by actor, action and period in the store's zone.
 * The page reads the log alone; the names of its people and entities come from one query per table.
 * Row-level security shows the log to owners and admins only.
 */
export async function listActivity(tx: Tx, workspaceId: string, request: ActivityRequest): Promise<ActivityPage> {
  const { query } = request
  const where = activityFilters(workspaceId, request)
  const [totalRow] = await tx.select({ n: count() }).from(activityLog).where(eq(activityLog.workspaceId, workspaceId))
  const [filteredRow] = await tx.select({ n: count() }).from(activityLog).where(where)
  const rows = await tx.select({
    id: activityLog.id, at: activityLog.at, action: activityLog.action, actorUserId: activityLog.actorUserId,
    entityType: activityLog.entityType, entityId: activityLog.entityId, details: activityLog.details,
  }).from(activityLog).where(where).orderBy(desc(activityLog.at), desc(activityLog.id))
    .limit(query.size).offset((query.page - 1) * query.size)

  const members = await tx.select({ id: users.id, name: users.name }).from(users).where(eq(users.workspaceId, workspaceId))
  const orderIds = idsOf(rows, 'order')
  const productIds = idsOf(rows, 'product')
  const collectionIds = idsOf(rows, 'collection')
  const customerIds = idsOf(rows, 'customer')
  const orderRows = orderIds.length === 0 ? [] : await tx.select({ id: orders.id, number: orders.number }).from(orders)
    .where(and(eq(orders.workspaceId, workspaceId), inArray(orders.id, orderIds)))
  const productRows = productIds.length === 0 ? [] : await tx.select({ id: products.id, slug: products.slug, name: products.name }).from(products)
    .where(and(eq(products.workspaceId, workspaceId), inArray(products.id, productIds)))
  const collectionRows = collectionIds.length === 0 ? [] : await tx.select({ id: collections.id, slug: collections.slug, name: collections.name }).from(collections)
    .where(and(eq(collections.workspaceId, workspaceId), inArray(collections.id, collectionIds)))
  const customerRows = customerIds.length === 0 ? [] : await tx.select({ id: customers.id, name: customers.name }).from(customers)
    .where(and(eq(customers.workspaceId, workspaceId), inArray(customers.id, customerIds)))

  const filtered = filteredRow?.n ?? 0

  return {
    rows,
    total: totalRow?.n ?? 0, filtered,
    page: query.page, pages: pageCount(filtered, query.size),
    members: members.sort((a, b) => compareNames(a.name, b.name)),
    lookups: {
      users: new Map(members.map(m => [m.id, m.name])),
      orders: new Map(orderRows.map(o => [o.id, o.number])),
      products: new Map(productRows.map(p => [p.id, { slug: p.slug, name: p.name }])),
      collections: new Map(collectionRows.map(c => [c.id, { slug: c.slug, name: c.name }])),
      customers: new Map(customerRows.map(c => [c.id, c.name])),
    },
  }
}
