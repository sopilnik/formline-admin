import type { Range } from '@/lib/periods'

/** The three sums the KPI cards need for one period. */
export type Totals = { revenueCents: number; orders: number; newCustomers: number }
export type Kpi = { value: number | null; previous: number | null; change: number | null }
export type Kpis = { revenue: Kpi; orders: Kpi; averageOrder: Kpi; newCustomers: Kpi }

/** Revenue ÷ orders, rounded to the cent; none without orders. */
export function averageOrderCents(totals: Totals): number | null {
  return totals.orders > 0 ? Math.round(totals.revenueCents / totals.orders) : null
}

/** (current − previous) ÷ previous; none when either is missing or the previous period was empty ("—"). */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null

  return (current - previous) / previous
}

/** Which way a change goes. */
export type Trend = 'up' | 'down' | 'flat'

/** The direction of a change, for its color and its words; none without a change. */
export function trendOf(change: number | null): Trend | null {
  if (change === null) return null

  return change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
}

const kpi = (value: number | null, previous: number | null): Kpi => ({ value, previous, change: change(value, previous) })

export function kpis(current: Totals, previous: Totals): Kpis {
  return {
    revenue: kpi(current.revenueCents, previous.revenueCents),
    orders: kpi(current.orders, previous.orders),
    averageOrder: kpi(averageOrderCents(current), averageOrderCents(previous)),
    newCustomers: kpi(current.newCustomers, previous.newCustomers),
  }
}

export type RevenuePoint = { at: Date; cents: number }

/** Sum per bucket: a point counts in the bucket whose half-open range holds it; a missing bucket stays null. */
export function bucketSums(points: readonly RevenuePoint[], buckets: readonly (Range | null)[]): (number | null)[] {
  return buckets.map(bucket => {
    if (!bucket) return null

    let sum = 0

    for (const point of points) if (point.at >= bucket.start && point.at < bucket.end) sum += point.cents

    return sum
  })
}

export type CollectionRevenue = { slug: string; name: string; posters: number; cents: number }
/** `share` of all posters, `bar` relative to the largest collection: no track, scaled to the largest. */
export type CollectionShare = CollectionRevenue & { share: number; bar: number }

export function collectionShares(rows: readonly CollectionRevenue[], postersCents: number): { rows: CollectionShare[]; otherCents: number } {
  const largest = Math.max(0, ...rows.map(row => row.cents))
  const shares = [...rows]
    .sort((a, b) => b.cents - a.cents)
    .map(row => ({ ...row, share: postersCents > 0 ? row.cents / postersCents : 0, bar: largest > 0 ? row.cents / largest : 0 }))
  const held = rows.reduce((total, row) => total + row.cents, 0)

  return { rows: shares, otherCents: Math.max(0, postersCents - held) }
}
