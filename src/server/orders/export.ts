import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import type { Pool } from 'pg'
import { csvMoney, csvText, EXPORT_CAP } from '@/lib/csv'
import type { OrdersQuery } from '@/lib/orders/query'
import type { OrderStatus } from '@/lib/orders/status'
import { isoInZone } from '@/lib/periods'
import { batchedCsvStream, type ExportPlan, type ExportRows } from '@/server/csv-export'
import { itemsSql, orderFilters, orderSort } from '@/server/dal/orders'
import { orderCustomer } from '@/server/dal/sql'
import { getPool } from '@/server/db/pool'
import { customers, orders } from '@/server/db/schema'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'

export type ExportLabels = {
  /** The eleven column names, in order, from the dictionary. */
  header: readonly string[]
  status: Record<OrderStatus, string>
  source: Record<'seed' | 'stripe', string>
  delivery: Record<'standard' | 'express', string>
}

/**
 * The orders of the file in the list's order: every order matching the filters, or the
 * selected ones (the list's sort, no filters). One more than the cap is read to learn
 * whether the list was cut.
 */
export async function planExport(
  ctx: WorkspaceContext,
  input: { query: OrdersQuery; ids: readonly string[] | null; now: Date; timeZone: string; cap?: number },
  pool: Pool = getPool(),
): Promise<ExportPlan> {
  const cap = input.cap ?? EXPORT_CAP

  return withWorkspace(ctx, async tx => {
    const where = input.ids
      ? and(eq(orders.workspaceId, ctx.workspaceId), inArray(orders.id, [...input.ids]))!
      : orderFilters(ctx.workspaceId, input.query, input.now, input.timeZone)
    const rows = await tx.select({ id: orders.id }).from(orders).innerJoin(customers, orderCustomer)
      .where(where).orderBy(...orderSort(input.query)).limit(cap + 1)

    return { ids: rows.slice(0, cap).map(row => row.id), truncated: rows.length > cap }
  }, pool)
}

type ExportRow = {
  id: string; number: number; placedAt: Date; customerName: string; customerEmail: string; items: number
  subtotalCents: number; shippingCents: number; totalCents: number; status: OrderStatus; source: 'seed' | 'stripe'; delivery: 'standard' | 'express'
}

function cells(row: ExportRow, labels: ExportLabels, timeZone: string): string[] {
  return [
    String(row.number),
    isoInZone(row.placedAt, timeZone),
    csvText(row.customerName),
    csvText(row.customerEmail),
    String(row.items),
    csvMoney(row.subtotalCents),
    csvMoney(row.shippingCents),
    csvMoney(row.totalCents),
    csvText(labels.status[row.status]),
    csvText(labels.source[row.source]),
    csvText(labels.delivery[row.delivery]),
  ]
}

/** The file in the planned order, batch by batch (the shared CSV stream). */
export function exportStream(ctx: WorkspaceContext, ids: readonly string[], labels: ExportLabels, timeZone: string, pool: Pool = getPool()): ReadableStream<Uint8Array> {
  const rows: ExportRows<ExportRow> = {
    read: (tx, slice) => tx
      .select({
        id: orders.id, number: orders.number, placedAt: orders.placedAt, customerName: customers.name, customerEmail: customers.email,
        items: itemsSql, subtotalCents: orders.subtotalCents, shippingCents: orders.shippingCents, totalCents: orders.totalCents,
        status: orders.status, source: orders.source, delivery: orders.delivery,
      })
      .from(orders).innerJoin(customers, orderCustomer)
      .where(and(eq(orders.workspaceId, ctx.workspaceId), inArray(orders.id, slice))),
    cells: row => cells(row, labels, timeZone),
  }

  return batchedCsvStream(ctx, ids, labels.header, rows, pool)
}
