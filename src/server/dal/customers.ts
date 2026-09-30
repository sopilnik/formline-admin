import 'server-only'
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type { CustomersQuery } from '@/lib/customers/query'
import { REVENUE_STATUSES } from '@/lib/orders/status'
import { pageCount } from '@/lib/pagination'
import { containsPattern } from '@/server/db/like'
import { customers, orders } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type CustomerRow = {
  id: string; name: string; email: string; city: string | null; country: string | null
  /** Every order of the customer, whatever its status. */
  orders: number
  /** The orders that count as revenue (paid, processing, shipped, delivered), as the overview counts them. */
  spentCents: number
  lastOrderAt: Date | null
}

export type CustomersList = {
  rows: CustomerRow[]
  /** Every customer of the workspace, and the ones the search keeps. */
  total: number; filtered: number
  page: number; pages: number
}

/** Orders join their customer inside the same workspace (composite keys, spec §6.1). */
const orderJoin = and(eq(orders.workspaceId, customers.workspaceId), eq(orders.customerId, customers.id))!

const revenueStatuses = sql.join(REVENUE_STATUSES.map(status => sql`${status}`), sql`, `)
const ordersSql = sql<number>`count(${orders.id})::int`
const spentSql = sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} in (${revenueStatuses})), 0)::int`
const lastSql = sql<Date | null>`max(${orders.placedAt})`
/** Names sort in the Unicode root order, whatever the database's own collation is (as on the products). */
const nameSql = sql`${customers.name} collate "unicode"`

/** The search: a case-insensitive part of the name or the email (spec §8.5). */
function customerFilters(workspaceId: string, query: CustomersQuery): SQL {
  const parts: SQL[] = [eq(customers.workspaceId, workspaceId)]
  if (query.q) {
    const pattern = containsPattern(query.q)
    parts.push(or(ilike(customers.name, pattern), ilike(customers.email, pattern))!)
  }
  return and(...parts)!
}

/** The ORDER BY: its column, then the name and the id, so pages never overlap; customers without orders come last by date. */
function customerSort(query: CustomersQuery): SQL[] {
  const direction = query.dir === 'asc' ? asc : desc
  const tail = [direction(nameSql), direction(customers.id)]
  if (query.sort === 'name') return tail
  if (query.sort === 'last') return [query.dir === 'asc' ? sql`${lastSql} asc nulls last` : sql`${lastSql} desc nulls last`, ...tail]
  return [direction(query.sort === 'orders' ? ordersSql : spentSql), ...tail]
}

/**
 * The customers list (spec §8.5): one page, searched, counted and sorted in the database.
 * The page is one query over the customers and their orders, grouped per customer — two
 * tables, the rule of spec §6.1.
 */
export async function listCustomers(tx: Tx, workspaceId: string, query: CustomersQuery): Promise<CustomersList> {
  const where = customerFilters(workspaceId, query)
  const [totalRow] = await tx.select({ n: count() }).from(customers).where(eq(customers.workspaceId, workspaceId))
  const [filteredRow] = query.q ? await tx.select({ n: count() }).from(customers).where(where) : [totalRow]
  const rows = await tx.select({
    id: customers.id, name: customers.name, email: customers.email, city: customers.city, country: customers.country,
    orders: ordersSql, spentCents: spentSql, lastOrderAt: lastSql.mapWith(orders.placedAt),
  }).from(customers).leftJoin(orders, orderJoin)
    .where(where)
    .groupBy(customers.workspaceId, customers.id)
    .orderBy(...customerSort(query)).limit(query.size).offset((query.page - 1) * query.size)
  const total = totalRow?.n ?? 0
  const filtered = filteredRow?.n ?? 0
  return { rows, total, filtered, page: query.page, pages: pageCount(filtered, query.size) }
}
