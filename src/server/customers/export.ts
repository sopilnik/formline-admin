import 'server-only'
import { and, eq, inArray, min } from 'drizzle-orm'
import type { Pool } from 'pg'
import type { CustomersQuery } from '@/lib/customers/query'
import { csvMoney, csvText } from '@/lib/csv'
import { isoInZone } from '@/lib/periods'
import { batchedCsvStream, EXPORT_CAP, type ExportPlan, type ExportRows } from '@/server/csv-export'
import { customerFilters, customerSort, lastSql, ordersSql, spentSql } from '@/server/dal/customers'
import { orderCustomer } from '@/server/dal/sql'
import { getPool } from '@/server/db/pool'
import { customers, orders } from '@/server/db/schema'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'

/** The nine column names, in order, from the dictionary. */
export type CustomerExportLabels = { header: readonly string[] }

/**
 * The customers of the file in the list's order: every customer the search keeps, at most
 * EXPORT_CAP, as the orders export (spec §8.5). One more than the cap is read to learn whether
 * the list was cut.
 */
export async function planCustomerExport(
  ctx: WorkspaceContext,
  input: { query: CustomersQuery; cap?: number },
  pool: Pool = getPool(),
): Promise<ExportPlan> {
  const cap = input.cap ?? EXPORT_CAP
  return withWorkspace(ctx, async tx => {
    const rows = await tx.select({ id: customers.id }).from(customers).leftJoin(orders, orderCustomer)
      .where(customerFilters(ctx.workspaceId, input.query))
      .groupBy(customers.workspaceId, customers.id)
      .orderBy(...customerSort(input.query)).limit(cap + 1)
    return { ids: rows.slice(0, cap).map(row => row.id), truncated: rows.length > cap }
  }, pool)
}

type ExportRow = {
  id: string; name: string; email: string; city: string | null; country: string | null; createdAt: Date
  orders: number; spentCents: number; firstOrderAt: Date | null; lastOrderAt: Date | null
}

function cells(row: ExportRow, timeZone: string): string[] {
  return [
    csvText(row.name),
    csvText(row.email),
    csvText(row.city ?? ''),
    csvText(row.country ?? ''),
    String(row.orders),
    csvMoney(row.spentCents),
    row.firstOrderAt ? isoInZone(row.firstOrderAt, timeZone) : '',
    row.lastOrderAt ? isoInZone(row.lastOrderAt, timeZone) : '',
    isoInZone(row.createdAt, timeZone),
  ]
}

/** The file in the planned order, batch by batch (the shared CSV stream, as the orders export). */
export function customerExportStream(ctx: WorkspaceContext, ids: readonly string[], labels: CustomerExportLabels, timeZone: string, pool: Pool = getPool()): ReadableStream<Uint8Array> {
  const rows: ExportRows<ExportRow> = {
    read: (tx, slice) => tx
      .select({
        id: customers.id, name: customers.name, email: customers.email, city: customers.city, country: customers.country, createdAt: customers.createdAt,
        orders: ordersSql, spentCents: spentSql,
        firstOrderAt: min(orders.placedAt), lastOrderAt: lastSql.mapWith(orders.placedAt),
      })
      .from(customers).leftJoin(orders, orderCustomer)
      .where(and(eq(customers.workspaceId, ctx.workspaceId), inArray(customers.id, slice)))
      .groupBy(customers.workspaceId, customers.id),
    cells: row => cells(row, timeZone),
  }
  return batchedCsvStream(ctx, ids, labels.header, rows, pool)
}
