import 'server-only'
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type { CustomersQuery } from '@/lib/customers/query'
import type { CustomerRow } from '@/lib/customers/view'
import type { OrderStatus } from '@/lib/orders/status'
import { pageCount } from '@/lib/pagination'
import { orderCustomer, revenueStatuses, unicodeName } from '@/server/dal/sql'
import { containsPattern } from '@/server/db/like'
import { customers, orders } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type CustomersList = {
  rows: CustomerRow[]
  /** Every customer of the workspace, and the ones the search keeps. */
  total: number; filtered: number
  page: number; pages: number
}

export const ordersSql = sql<number>`count(${orders.id})::int`
export const spentSql = sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in (${revenueStatuses})), 0)::int`
export const lastSql = sql<Date | null>`max(${orders.placedAt})`
const nameSql = unicodeName(customers.name)

/** The search: a case-insensitive part of the name or the email. */
export function customerFilters(workspaceId: string, query: CustomersQuery): SQL {
  const parts: SQL[] = [eq(customers.workspaceId, workspaceId)]
  if (query.q) {
    const pattern = containsPattern(query.q)
    parts.push(or(ilike(customers.name, pattern), ilike(customers.email, pattern))!)
  }
  return and(...parts)!
}

/** The ORDER BY: its column, then the name and the id, so pages never overlap; customers without orders come last by date. */
export function customerSort(query: CustomersQuery): SQL[] {
  const direction = query.dir === 'asc' ? asc : desc
  const tail = [direction(nameSql), direction(customers.id)]
  if (query.sort === 'name') return tail
  if (query.sort === 'last') return [query.dir === 'asc' ? sql`${lastSql} asc nulls last` : sql`${lastSql} desc nulls last`, ...tail]
  return [direction(query.sort === 'orders' ? ordersSql : spentSql), ...tail]
}

/**
 * The customers list: one page, searched, counted and sorted in the database.
 * The page is one query over the customers and their orders, grouped per customer — two
 * tables, which keeps the planner's estimates right for a new sandbox's rows.
 */
export async function listCustomers(tx: Tx, workspaceId: string, query: CustomersQuery): Promise<CustomersList> {
  const where = customerFilters(workspaceId, query)
  const [totalRow] = await tx.select({ n: count() }).from(customers).where(eq(customers.workspaceId, workspaceId))
  const [filteredRow] = query.q ? await tx.select({ n: count() }).from(customers).where(where) : [totalRow]
  const rows = await tx.select({
    id: customers.id, name: customers.name, email: customers.email, city: customers.city, country: customers.country,
    orders: ordersSql, spentCents: spentSql, lastOrderAt: lastSql.mapWith(orders.placedAt),
  }).from(customers).leftJoin(orders, orderCustomer)
    .where(where)
    .groupBy(customers.workspaceId, customers.id)
    .orderBy(...customerSort(query)).limit(query.size).offset((query.page - 1) * query.size)
  const total = totalRow?.n ?? 0
  const filtered = filteredRow?.n ?? 0
  return { rows, total, filtered, page: query.page, pages: pageCount(filtered, query.size) }
}

export type CustomerOrder = { id: string; number: number; placedAt: Date; totalCents: number; status: OrderStatus }

export type CustomerDetail = {
  id: string; name: string; email: string; city: string | null; country: string | null; notes: string; createdAt: Date
  /** Every order; the revenue orders and what they brought, as the list counts them. */
  orders: number; revenueOrders: number; spentCents: number
  firstOrderAt: Date | null; lastOrderAt: Date | null
  /** The latest orders, at most CUSTOMER_ORDERS_SHOWN. */
  recent: CustomerOrder[]
}

/** The customer page lists this many orders; the orders list, searched by the email, has the rest. */
export const CUSTOMER_ORDERS_SHOWN = 50

/** One customer with the figures and the orders the page shows; each query reads one table. */
export async function getCustomer(tx: Tx, workspaceId: string, id: string): Promise<CustomerDetail | null> {
  const [customer] = await tx.select({
    id: customers.id, name: customers.name, email: customers.email, city: customers.city, country: customers.country,
    notes: customers.notes, createdAt: customers.createdAt,
  }).from(customers).where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, id)))
  if (!customer) return null
  const own = and(eq(orders.workspaceId, workspaceId), eq(orders.customerId, id))
  const [figures] = await tx.select({
    orders: ordersSql,
    revenueOrders: sql<number>`(count(*) filter (where ${orders.status} in (${revenueStatuses})))::int`,
    spentCents: spentSql,
    firstOrderAt: sql<Date | null>`min(${orders.placedAt})`.mapWith(orders.placedAt),
    lastOrderAt: lastSql.mapWith(orders.placedAt),
  }).from(orders).where(own)
  const recent = await tx.select({ id: orders.id, number: orders.number, placedAt: orders.placedAt, totalCents: orders.totalCents, status: orders.status })
    .from(orders).where(own).orderBy(desc(orders.placedAt), desc(orders.id)).limit(CUSTOMER_ORDERS_SHOWN)
  return {
    ...customer,
    orders: figures?.orders ?? 0, revenueOrders: figures?.revenueOrders ?? 0, spentCents: figures?.spentCents ?? 0,
    firstOrderAt: figures?.firstOrderAt ?? null, lastOrderAt: figures?.lastOrderAt ?? null,
    recent,
  }
}

/** Replaces the notes; last save wins. Null when the workspace holds no such customer. */
export async function updateCustomerNotes(tx: Tx, workspaceId: string, id: string, notes: string): Promise<{ name: string; changed: boolean } | null> {
  const [current] = await tx.select({ name: customers.name, notes: customers.notes }).from(customers)
    .where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, id)))
  if (!current) return null
  if (current.notes === notes) return { name: current.name, changed: false }
  // A role that may not write customers updates nothing under row-level security: that is not a save.
  const updated = await tx.update(customers).set({ notes }).where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, id)))
    .returning({ id: customers.id })
  return updated.length === 1 ? { name: current.name, changed: true } : null
}
