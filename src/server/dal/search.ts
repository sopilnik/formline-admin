import 'server-only'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { orderNumberOf, SEARCH_LIMIT, type SearchResults } from '@/lib/search'
import { containsPattern } from '@/server/db/like'
import { customers, orders, products } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'
import { customerJoin } from '@/server/dal/orders'

/**
 * The palette's search (spec §8.10): orders by their number or the customer's email, newest first; customers by name or
 * email and products by name or slug, by name. Five of each; every query reads at most two tables.
 */
export async function searchWorkspace(tx: Tx, workspaceId: string, term: string): Promise<SearchResults> {
  const pattern = containsPattern(term)
  const number = orderNumberOf(term)
  const orderRows = await tx
    .select({ number: orders.number, customer: customers.name, totalCents: orders.totalCents, status: orders.status })
    .from(orders).innerJoin(customers, customerJoin)
    .where(and(eq(orders.workspaceId, workspaceId), or(number === null ? sql`false` : eq(orders.number, number), ilike(customers.email, pattern))))
    .orderBy(desc(orders.placedAt), desc(orders.id)).limit(SEARCH_LIMIT)
  const customerRows = await tx
    .select({ id: customers.id, name: customers.name, email: customers.email })
    .from(customers)
    .where(and(eq(customers.workspaceId, workspaceId), or(ilike(customers.name, pattern), ilike(customers.email, pattern))))
    .orderBy(asc(sql`${customers.name} collate "unicode"`), asc(customers.id)).limit(SEARCH_LIMIT)
  const productRows = await tx
    .select({ slug: products.slug, name: products.name, status: products.status })
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), or(ilike(products.name, pattern), ilike(products.slug, pattern))))
    .orderBy(asc(sql`${products.name} collate "unicode"`), asc(products.id)).limit(SEARCH_LIMIT)
  return { orders: orderRows, customers: customerRows, products: productRows }
}
