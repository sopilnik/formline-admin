import 'server-only'
import { sql } from 'drizzle-orm'
import type { CollectionRevenue, RevenuePoint, Totals } from '@/lib/overview/kpi'
import { REVENUE_STATUSES } from '@/lib/orders/status'
import type { Range } from '@/lib/periods'
import type { Tx } from '@/server/db/with-workspace'

// The orders that count as revenue (spec §8.1), bound as parameters.
const revenueStatuses = sql.join(REVENUE_STATUSES.map(status => sql`${status}`), sql`, `)

/** Revenue, orders and new customers of a period (spec §8.1). Sums and counts arrive as strings. */
export async function revenueTotals(tx: Tx, workspaceId: string, range: Range): Promise<Totals> {
  const { rows } = await tx.execute<{ revenue: string; orders: string; new_customers: string }>(sql`
    select coalesce(sum(o.total_cents), 0) as revenue,
           count(*) as orders,
           (select count(*)
              from (select min(f.placed_at) as first_at
                      from fa.orders f
                     where f.workspace_id = ${workspaceId} and f.status in (${revenueStatuses})
                     group by f.customer_id) firsts
             where firsts.first_at >= ${range.start} and firsts.first_at < ${range.end}) as new_customers
      from fa.orders o
     where o.workspace_id = ${workspaceId} and o.status in (${revenueStatuses})
       and o.placed_at >= ${range.start} and o.placed_at < ${range.end}`)
  const row = rows[0]!
  return { revenueCents: Number(row.revenue), orders: Number(row.orders), newCustomers: Number(row.new_customers) }
}

/** Every revenue order of a span as a point in time, for the chart's buckets. */
export async function revenuePoints(tx: Tx, workspaceId: string, range: Range): Promise<RevenuePoint[]> {
  const { rows } = await tx.execute<{ placed_at: string; total_cents: number }>(sql`
    select o.placed_at, o.total_cents
      from fa.orders o
     where o.workspace_id = ${workspaceId} and o.status in (${revenueStatuses})
       and o.placed_at >= ${range.start} and o.placed_at < ${range.end}`)
  return rows.map(row => ({ at: new Date(row.placed_at), cents: Number(row.total_cents) }))
}

/**
 * Posters and shipping of the period's revenue orders, and the line subtotals by collection.
 * Four small queries joined in code: none joins more than two tables, so its plan stays cheap
 * while the planner's statistics have not yet seen a new sandbox (a three-way join planned on
 * such estimates took 15 s in the end-to-end database; ANALYZE brought it back to 1 ms).
 */
export async function collectionRevenue(tx: Tx, workspaceId: string, range: Range): Promise<{ postersCents: number; shippingCents: number; rows: CollectionRevenue[] }> {
  const inPeriod = sql`o.workspace_id = ${workspaceId} and o.status in (${revenueStatuses}) and o.placed_at >= ${range.start} and o.placed_at < ${range.end}`
  const totals = await tx.execute<{ posters: string; shipping: string }>(sql`
    select coalesce(sum(o.subtotal_cents), 0) as posters, coalesce(sum(o.shipping_cents), 0) as shipping
      from fa.orders o
     where ${inPeriod}`)
  const sold = await tx.execute<{ variant_id: string | null; posters: string; cents: string }>(sql`
    select l.variant_id, sum(l.qty) as posters, sum(l.unit_cents * l.qty) as cents
      from fa.orders o
      join fa.order_lines l on l.workspace_id = o.workspace_id and l.order_id = o.id
     where ${inPeriod}
     group by l.variant_id`)
  const owners = await tx.execute<{ variant_id: string; collection_id: string }>(sql`
    select v.id as variant_id, p.collection_id
      from fa.product_variants v
      join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id
     where v.workspace_id = ${workspaceId}`)
  const collections = await tx.execute<{ id: string; slug: string; name: string }>(sql`
    select c.id, c.slug, c.name from fa.collections c where c.workspace_id = ${workspaceId} order by c.position`)
  const collectionOf = new Map(owners.rows.map(row => [row.variant_id, row.collection_id]))
  const byCollection = new Map<string, { posters: number; cents: number }>()
  for (const row of sold.rows) {
    // A store line the catalog does not know stays out of every collection; collectionShares reports it as "other".
    const collectionId = row.variant_id === null ? undefined : collectionOf.get(row.variant_id)
    if (!collectionId) continue
    const sum = byCollection.get(collectionId) ?? { posters: 0, cents: 0 }
    sum.posters += Number(row.posters)
    sum.cents += Number(row.cents)
    byCollection.set(collectionId, sum)
  }
  const sums = totals.rows[0]!
  return {
    postersCents: Number(sums.posters),
    shippingCents: Number(sums.shipping),
    rows: collections.rows.map(c => ({ slug: c.slug, name: c.name, posters: byCollection.get(c.id)?.posters ?? 0, cents: byCollection.get(c.id)?.cents ?? 0 })),
  }
}

/** The "action now" strip (spec §8.1): orders to process, orders in processing, sold-out variants of live products. */
export async function attentionCounts(tx: Tx, workspaceId: string): Promise<{ toProcess: number; processing: number; soldOut: number }> {
  const { rows } = await tx.execute<{ to_process: string; processing: string; sold_out: string }>(sql`
    select (select count(*) from fa.orders o where o.workspace_id = ${workspaceId} and o.status = 'paid') as to_process,
           (select count(*) from fa.orders o where o.workspace_id = ${workspaceId} and o.status = 'processing') as processing,
           (select count(*)
              from fa.product_variants v
              join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id
             where v.workspace_id = ${workspaceId} and v.stock = 0 and p.status <> 'archived') as sold_out`)
  const row = rows[0]!
  return { toProcess: Number(row.to_process), processing: Number(row.processing), soldOut: Number(row.sold_out) }
}
