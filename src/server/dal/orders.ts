import 'server-only'
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { imageSrc } from '@/lib/catalog'
import type { OrdersQuery } from '@/lib/orders/query'
import { canTransition, isOrderStatus, ORDER_STATUSES, returnsStock, type OrderStatus } from '@/lib/orders/status'
import type { OrderRow } from '@/lib/orders/view'
import { pageCount } from '@/lib/pagination'
import { presetRange } from '@/lib/periods'
import { orderNumberOf } from '@/lib/search'
import { orderCustomer } from '@/server/dal/sql'
import { containsPattern } from '@/server/db/like'
import { customers, images, orderEvents, orderLines, orders, products, productVariants, users } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type OrdersPage = { rows: OrderRow[]; filtered: number; total: number; statusCounts: Record<OrderStatus, number>; page: number; pages: number }

/** Sum of the line quantities of the order — the "Items" column. */
export const itemsSql = sql<number>`(select coalesce(sum(l.qty), 0)::int from fa.order_lines l where l.workspace_id = ${orders.workspaceId} and l.order_id = ${orders.id})`

const SORT_COLUMNS = { placed: orders.placedAt, number: orders.number, total: orders.totalCents } as const

// A whole address ("ann@example.com") names one customer: it matches that address only, not the ones that contain it.
const WHOLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The search: an order number with or without its "#", a whole email, or a fragment of a customer's name or email. */
function searchCondition(term: string): SQL {
  const number = orderNumberOf(term)
  const byNumber = number !== null ? eq(orders.number, number) : sql`false`

  if (WHOLE_EMAIL.test(term)) return or(byNumber, sql`lower(${customers.email}) = lower(${term})`)!

  const pattern = containsPattern(term)

  return or(byNumber, ilike(customers.name, pattern), ilike(customers.email, pattern))!
}

export type OrdersRequest = { query: OrdersQuery; now: Date; timeZone: string }

/** Every filter of the query as one condition; `withStatus: false` leaves the status out (the chip counts). */
export function orderFilters(workspaceId: string, { query, now, timeZone }: OrdersRequest, withStatus = true): SQL {
  const parts: SQL[] = [eq(orders.workspaceId, workspaceId)]

  if (withStatus && query.status.length > 0) parts.push(inArray(orders.status, query.status))

  const term = query.q.trim()

  if (term) parts.push(searchCondition(term))

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

/** The columns of one list row; the overview's latest orders read the same shape. */
export const ROW_FIELDS = {
  id: orders.id, number: orders.number, placedAt: orders.placedAt, customerName: customers.name, customerEmail: customers.email,
  items: itemsSql, totalCents: orders.totalCents, status: orders.status, source: orders.source,
}

export async function listOrders(tx: Tx, workspaceId: string, request: OrdersRequest): Promise<OrdersPage> {
  const { query } = request
  const where = orderFilters(workspaceId, request)
  const rows = await tx
    .select(ROW_FIELDS)
    .from(orders).innerJoin(customers, orderCustomer).where(where)
    .orderBy(...orderSort(query)).limit(query.size).offset((query.page - 1) * query.size)
  const [filteredRow] = await tx.select({ n: count() }).from(orders).innerJoin(customers, orderCustomer).where(where)
  const [totalRow] = await tx.select({ n: count() }).from(orders).where(eq(orders.workspaceId, workspaceId))
  const byStatus = await tx.select({ status: orders.status, n: count() }).from(orders).innerJoin(customers, orderCustomer)
    .where(orderFilters(workspaceId, request, false)).groupBy(orders.status)
  const statusCounts = Object.fromEntries(ORDER_STATUSES.map(status => [status, 0])) as Record<OrderStatus, number>

  for (const row of byStatus) statusCounts[row.status] = row.n

  const filtered = filteredRow?.n ?? 0

  return { rows, filtered, total: totalRow?.n ?? 0, statusCounts, page: query.page, pages: pageCount(filtered, query.size) }
}

/** The orders waiting in "paid": the sidebar count and the first link of the overview's strip. */
export async function ordersToProcess(tx: Tx, workspaceId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.workspaceId, workspaceId), eq(orders.status, 'paid')))

  return row?.n ?? 0
}

export type StatusChange =
  | { ok: true; number: number; from: OrderStatus; to: OrderStatus }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'invalid_transition'; number: number; from: OrderStatus; to: OrderStatus }

/**
 * One status step: the row is locked, the machine is checked, the event is
 * written, and canceling or refunding before shipping puts the line quantities back
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

const addressSchema = z.object({ name: z.string(), line1: z.string(), postalCode: z.string(), city: z.string(), country: z.string() })

export type ShippingAddress = z.infer<typeof addressSchema>

export type OrderLineDetail = {
  id: string; name: string; sku: string | null; unitCents: number; qty: number; unmatched: boolean
  /** The product the line's variant belongs to; null for a line the catalog does not know. */
  product: { slug: string; imageSrc: string | null } | null
}

/** One entry of an order's history, in one of the two shapes the database's `order_events_shape` check allows. */
export type OrderEventDetail = {
  id: string
  /** Null for events without a person: the Stripe ingest and the seed's first event ("System"). */
  actorName: string | null
  at: Date
} & ({ kind: 'status'; from: OrderStatus | null; to: OrderStatus } | { kind: 'note'; note: string })

export type OrderDetail = {
  id: string; number: number; status: OrderStatus; source: 'seed' | 'stripe'; delivery: 'standard' | 'express'
  subtotalCents: number; shippingCents: number; totalCents: number; placedAt: Date
  address: ShippingAddress | null
  customer: { id: string; name: string; email: string; city: string | null; country: string | null }
  lines: OrderLineDetail[]
  history: OrderEventDetail[]
}

const asStatus = (value: string | null): OrderStatus | null => (value !== null && isOrderStatus(value) ? value : null)

type EventRow = { id: string; kind: 'status' | 'note'; from: string | null; to: string | null; note: string | null; actorName: string | null; at: Date }

/** A history row in its shape; a row that breaks `order_events_shape` cannot be stored, so meeting one is a bug. */
function toEventDetail(event: EventRow): OrderEventDetail {
  const common = { id: event.id, actorName: event.actorName, at: event.at }
  const to = asStatus(event.to)

  if (event.kind === 'status' && to !== null) return { ...common, kind: 'status', from: asStatus(event.from), to }
  if (event.kind === 'note' && event.note !== null) return { ...common, kind: 'note', note: event.note }
  throw new Error(`order event ${event.id} breaks order_events_shape`)
}

/** The newest orders (eight on the overview), in the list's row shape and order. */
export async function latestOrders(tx: Tx, workspaceId: string, limit = 8): Promise<OrderRow[]> {
  return tx.select(ROW_FIELDS).from(orders).innerJoin(customers, orderCustomer)
    .where(eq(orders.workspaceId, workspaceId))
    .orderBy(desc(orders.placedAt), desc(orders.id)).limit(limit)
}

/** One order by the number people quote, with everything its page shows. */
export async function getOrder(tx: Tx, workspaceId: string, number: number): Promise<OrderDetail | null> {
  const [order] = await tx
    .select({
      id: orders.id, number: orders.number, status: orders.status, source: orders.source, delivery: orders.delivery,
      subtotalCents: orders.subtotalCents, shippingCents: orders.shippingCents, totalCents: orders.totalCents,
      placedAt: orders.placedAt, address: orders.shippingAddress,
      customerId: customers.id, customerName: customers.name, customerEmail: customers.email, customerCity: customers.city, customerCountry: customers.country,
    })
    .from(orders).innerJoin(customers, orderCustomer)
    .where(and(eq(orders.workspaceId, workspaceId), eq(orders.number, number)))

  if (!order) return null

  const lines = await tx.select().from(orderLines)
    .where(and(eq(orderLines.workspaceId, workspaceId), eq(orderLines.orderId, order.id)))
    .orderBy(asc(orderLines.name), asc(orderLines.id))
  const variantIds = lines.flatMap(line => (line.variantId ? [line.variantId] : []))
  const catalog = variantIds.length === 0 ? [] : await tx
    .select({ variantId: productVariants.id, slug: products.slug, imageId: images.id, storagePath: images.storagePath, imageSource: images.source })
    .from(productVariants)
    .innerJoin(products, and(eq(products.workspaceId, productVariants.workspaceId), eq(products.id, productVariants.productId)))
    .leftJoin(images, and(eq(images.workspaceId, products.workspaceId), eq(images.id, products.imageId)))
    .where(and(eq(productVariants.workspaceId, workspaceId), inArray(productVariants.id, variantIds)))
  const productOf = new Map(catalog.map(row => [row.variantId, {
    slug: row.slug,
    imageSrc: row.imageId && row.storagePath && row.imageSource ? imageSrc({ id: row.imageId, storagePath: row.storagePath, source: row.imageSource }) : null,
  }]))

  const events = await tx
    .select({ id: orderEvents.id, kind: orderEvents.kind, from: orderEvents.fromStatus, to: orderEvents.toStatus, note: orderEvents.note, actorName: users.name, at: orderEvents.at })
    .from(orderEvents)
    .leftJoin(users, and(eq(users.workspaceId, orderEvents.workspaceId), eq(users.id, orderEvents.actorUserId)))
    .where(and(eq(orderEvents.workspaceId, workspaceId), eq(orderEvents.orderId, order.id)))
    .orderBy(asc(orderEvents.at), asc(orderEvents.id))

  const address = addressSchema.safeParse(order.address)

  return {
    id: order.id, number: order.number, status: order.status, source: order.source, delivery: order.delivery,
    subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, totalCents: order.totalCents, placedAt: order.placedAt,
    address: address.success ? address.data : null,
    customer: { id: order.customerId, name: order.customerName, email: order.customerEmail, city: order.customerCity, country: order.customerCountry },
    lines: lines.map(line => ({
      id: line.id, name: line.name, sku: line.sku, unitCents: line.unitCents, qty: line.qty, unmatched: line.unmatched,
      product: line.variantId ? (productOf.get(line.variantId) ?? null) : null,
    })),
    history: events.map(toEventDetail),
  }
}

/** An internal note on an order; null when the workspace holds no such order. */
export async function addOrderNote(tx: Tx, ctx: { workspaceId: string; userId: string }, input: { orderId: string; note: string }): Promise<{ number: number } | null> {
  const [row] = await tx.select({ number: orders.number }).from(orders)
    .where(and(eq(orders.workspaceId, ctx.workspaceId), eq(orders.id, input.orderId)))

  if (!row) return null
  await tx.insert(orderEvents).values({ workspaceId: ctx.workspaceId, orderId: input.orderId, kind: 'note', note: input.note, actorUserId: ctx.userId })

  return { number: row.number }
}
