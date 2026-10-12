import 'server-only'
import { and, eq, inArray, min } from 'drizzle-orm'
import type { Pool } from 'pg'
import type { CustomersQuery } from '@/lib/customers/query'
import { csvMoney, csvRecord, csvText, CSV_BOM } from '@/lib/csv'
import { isoInZone } from '@/lib/periods'
import { customerFilters, customerSort, lastSql, ordersSql, spentSql } from '@/server/dal/customers'
import { orderCustomer } from '@/server/dal/sql'
import { getPool } from '@/server/db/pool'
import { customers, orders } from '@/server/db/schema'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { EXPORT_CAP } from '@/server/orders/export'

const BATCH = 500

/** The nine column names, in order, from the dictionary. */
export type CustomerExportLabels = { header: readonly string[] }
export type CustomerExportPlan = { ids: string[]; truncated: boolean }

/**
 * The customers of the file in the list's order: every customer the search keeps, at most
 * EXPORT_CAP, as the orders export (spec §8.5). One more than the cap is read to learn whether
 * the list was cut.
 */
export async function planCustomerExport(
  ctx: WorkspaceContext,
  input: { query: CustomersQuery; cap?: number },
  pool: Pool = getPool(),
): Promise<CustomerExportPlan> {
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

/** The file, batch by batch in the planned order, each batch in its own short transaction (as the orders export). */
export function customerExportStream(ctx: WorkspaceContext, ids: readonly string[], labels: CustomerExportLabels, timeZone: string, pool: Pool = getPool()): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let next = 0
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(CSV_BOM + csvRecord(labels.header.map(csvText))))
    },
    async pull(controller) {
      if (next >= ids.length) {
        controller.close()
        return
      }
      const slice = ids.slice(next, next + BATCH)
      next += BATCH
      const rows = await withWorkspace(ctx, tx => tx
        .select({
          id: customers.id, name: customers.name, email: customers.email, city: customers.city, country: customers.country, createdAt: customers.createdAt,
          orders: ordersSql, spentCents: spentSql,
          firstOrderAt: min(orders.placedAt), lastOrderAt: lastSql.mapWith(orders.placedAt),
        })
        .from(customers).leftJoin(orders, orderCustomer)
        .where(and(eq(customers.workspaceId, ctx.workspaceId), inArray(customers.id, [...slice])))
        .groupBy(customers.workspaceId, customers.id), pool)
      const byId = new Map(rows.map(row => [row.id, row]))
      let text = ''
      for (const id of slice) {
        const row = byId.get(id)
        if (row) text += csvRecord(cells(row, timeZone))
      }
      controller.enqueue(encoder.encode(text))
    },
  })
}
