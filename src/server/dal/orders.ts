import 'server-only'
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import type { OrdersQuery } from '@/lib/orders/query'
import { canTransition, ORDER_STATUSES, returnsStock, type OrderStatus } from '@/lib/orders/status'
import { presetRange } from '@/lib/periods'
import { customers, orderEvents, orders } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type OrderRow = {
  id: string; number: number; placedAt: Date; customerName: string; customerEmail: string
  items: number; totalCents: number; status: OrderStatus; source: 'seed' | 'stripe'
}
export type OrdersPage = { rows: OrderRow[]; filtered: number; total: number; statusCounts: Record<OrderStatus, number>; page: number; pages: number }

/** Customers join their orders inside the same workspace (composite keys, spec §6.1). */
export const customerJoin = and(eq(customers.workspaceId, orders.workspaceId), eq(customers.id, orders.customerId))!

/** Sum of the line quantities of the order — the "Items" column. */
export const itemsSql = sql<number>`(select coalesce(sum(l.qty), 0)::int from fa.order_lines l where l.workspace_id = ${orders.workspaceId} and l.order_id = ${orders.id})`

const SORT_COLUMNS = { placed: orders.placedAt, number: orders.number, total: orders.totalCents } as const

const escapeLike = (text: string): string => text.replace(/[\\%_]/g, match => `\\${match}`)

/** Every filter of the query as one condition; `withStatus: false` leaves the status out (the chip counts, spec §8.2). */
export function orderFilters(workspaceId: string, query: OrdersQuery, now: Date, timeZone: string, withStatus = true): SQL {
  const parts: SQL[] = [eq(orders.workspaceId, workspaceId)]
  if (withStatus && query.status.length > 0) parts.push(inArray(orders.status, query.status))
  const term = query.q.trim()
  if (term) {
    const pattern = `%${escapeLike(term)}%`
    const byNumber = /^\d{1,9}$/.test(term) ? eq(orders.number, Number(term)) : sql`false`
    parts.push(or(byNumber, ilike(customers.name, pattern), ilike(customers.email, pattern))!)
  }
  const range = presetRange(query.placed, now, timeZone)
  if (range) parts.push(gte(orders.placedAt, range.start), lt(orders.placedAt, range.end))
  if (query.source !== 'any') parts.push(eq(orders.source, query.source))
  return and(...parts)!
}

/** The ORDER BY of the query, with the id as the tie-breaker so pages never overlap. */
export function orderSort(query: OrdersQuery): SQL[] {
  const direction = query.dir === 'asc' ? asc : desc
  return [direction(SORT_COLUMNS[query.sort]), direction(orders.id)]
}

/** The columns of one list row; the overview's latest orders (task 4.8) read the same shape. */
export const ROW_FIELDS = {
  id: orders.id, number: orders.number, placedAt: orders.placedAt, customerName: customers.name, customerEmail: customers.email,
  items: itemsSql, totalCents: orders.totalCents, status: orders.status, source: orders.source,
}

export async function listOrders(tx: Tx, workspaceId: string, query: OrdersQuery, now: Date, timeZone: string): Promise<OrdersPage> {
  const where = orderFilters(workspaceId, query, now, timeZone)
  const rows = await tx
    .select(ROW_FIELDS)
    .from(orders).innerJoin(customers, customerJoin).where(where)
    .orderBy(...orderSort(query)).limit(query.size).offset((query.page - 1) * query.size)
  const [filteredRow] = await tx.select({ n: count() }).from(orders).innerJoin(customers, customerJoin).where(where)
  const [totalRow] = await tx.select({ n: count() }).from(orders).where(eq(orders.workspaceId, workspaceId))
  const byStatus = await tx.select({ status: orders.status, n: count() }).from(orders).innerJoin(customers, customerJoin)
    .where(orderFilters(workspaceId, query, now, timeZone, false)).groupBy(orders.status)
  const statusCounts = Object.fromEntries(ORDER_STATUSES.map(status => [status, 0])) as Record<OrderStatus, number>
  for (const row of byStatus) statusCounts[row.status] = row.n
  const filtered = filteredRow?.n ?? 0
  return { rows, filtered, total: totalRow?.n ?? 0, statusCounts, page: query.page, pages: Math.max(1, Math.ceil(filtered / query.size)) }
}

/** The orders waiting in "paid": the sidebar count and the first link of the overview's strip (spec §8.1, §11). */
export async function ordersToProcess(tx: Tx, workspaceId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.workspaceId, workspaceId), eq(orders.status, 'paid')))
  return row?.n ?? 0
}

export type StatusChange =
  | { ok: true; number: number; from: OrderStatus; to: OrderStatus }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_transition'; number: number; from: OrderStatus; to: OrderStatus }

/**
 * One status step (spec §8.2): the row is locked, the machine is checked, the event is
 * written, and cancelling or refunding before shipping puts the line quantities back
 * on their variants. For a viewer, row-level security applies the update policy to the
 * locking read as well, so the order is simply not found (checked on Postgres 18).
 */
export async function changeOrderStatus(tx: Tx, ctx: { workspaceId: string; userId: string }, input: { orderId: string; to: OrderStatus }): Promise<StatusChange> {
  const [row] = await tx.select({ number: orders.number, status: orders.status }).from(orders)
    .where(and(eq(orders.workspaceId, ctx.workspaceId), eq(orders.id, input.orderId))).for('update')
  if (!row) return { ok: false, reason: 'not_found' }
  const from = row.status
  if (!canTransition(from, input.to)) return { ok: false, reason: 'invalid_transition', number: row.number, from, to: input.to }
  const updated = await tx.update(orders).set({ status: input.to, updatedAt: sql`now()` }).where(and(eq(orders.workspaceId, ctx.workspaceId), eq(orders.id, input.orderId)))
  // The locking read already filtered out a role the update policy refuses; should a policy ever
  // disagree with it, a silent no-op must not be reported as a status change.
  if (!updated.rowCount) throw new Error('the order status update was refused')
  await tx.insert(orderEvents).values({ workspaceId: ctx.workspaceId, orderId: input.orderId, kind: 'status', fromStatus: from, toStatus: input.to, actorUserId: ctx.userId })
  if (returnsStock(from, input.to)) {
    await tx.execute(sql`
      update fa.product_variants v set stock = v.stock + l.qty
        from fa.order_lines l
       where l.workspace_id = v.workspace_id and l.variant_id = v.id
         and l.workspace_id = ${ctx.workspaceId} and l.order_id = ${input.orderId}`)
  }
  return { ok: true, number: row.number, from, to: input.to }
}
