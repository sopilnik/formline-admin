import 'server-only'
import { and, eq, sql, type Column, type SQL } from 'drizzle-orm'
import { REVENUE_STATUSES } from '@/lib/orders/status'
import { customers, orders } from '@/server/db/schema'

/** The order statuses that count as revenue, bound as parameters. */
export const revenueStatuses = sql.join(REVENUE_STATUSES.map(status => sql`${status}`), sql`, `)

/** An order and its customer, joined inside the same workspace (composite keys). */
export const orderCustomer = and(eq(orders.workspaceId, customers.workspaceId), eq(orders.customerId, customers.id))!

/** A name in the Unicode root order, whatever the database's own collation is. */
export const unicodeName = (column: Column): SQL => sql`${column} collate "unicode"`
