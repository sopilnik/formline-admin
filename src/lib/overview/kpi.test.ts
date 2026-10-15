import { describe, expect, it } from 'vitest'
import { averageOrderCents, bucketSums, change, collectionShares, kpis, trendOf } from '@/lib/overview/kpi'

describe('KPI arithmetic', () => {
  it('divides revenue by orders for the average order value, and has none without orders', () => {
    expect(averageOrderCents({ revenueCents: 1428600, orders: 214, newCustomers: 61 })).toBe(6676)
    expect(averageOrderCents({ revenueCents: 0, orders: 0, newCustomers: 0 })).toBeNull()
  })

  it('computes the change against the previous period, none when that was empty', () => {
    expect(change(1428600, 1271000)).toBeCloseTo(0.124, 3)
    expect(change(61, 64)).toBeCloseTo(-0.0469, 3)
    expect(change(10, 0)).toBeNull()
    expect(change(null, 100)).toBeNull()
  })

  it('names the direction of a change, and none without one', () => {
    expect(trendOf(0.124)).toBe('up')
    expect(trendOf(-0.0469)).toBe('down')
    expect(trendOf(0)).toBe('flat')
    expect(trendOf(null)).toBeNull()
  })

  it('assembles the four cards', () => {
    const result = kpis({ revenueCents: 1428600, orders: 214, newCustomers: 61 }, { revenueCents: 1271000, orders: 198, newCustomers: 64 })

    expect(result.revenue).toEqual({ value: 1428600, previous: 1271000, change: (1428600 - 1271000) / 1271000 })
    expect(result.orders.value).toBe(214)
    expect(result.averageOrder).toEqual({ value: 6676, previous: 6419, change: (6676 - 6419) / 6419 })
    expect(result.newCustomers.change).toBeCloseTo(-0.0469, 3)
  })

  it('puts every point into the bucket that holds it, half-open, and leaves missing buckets empty', () => {
    const buckets = [
      { start: new Date('2026-10-24T22:00:00Z'), end: new Date('2026-10-25T23:00:00Z') },  // 25 October in Berlin: 25 hours
      { start: new Date('2026-10-25T23:00:00Z'), end: new Date('2026-10-26T23:00:00Z') },
      null,
    ]
    const points = [
      { at: new Date('2026-10-24T22:00:00Z'), cents: 100 },
      { at: new Date('2026-10-25T22:30:00Z'), cents: 200 },   // 23:30 local on the long day
      { at: new Date('2026-10-25T23:00:00Z'), cents: 400 },   // midnight: the next day
      { at: new Date('2026-10-27T09:00:00Z'), cents: 800 },   // outside every bucket
    ]

    expect(bucketSums(points, buckets)).toEqual([300, 400, null])
  })

  it('scales collection bars to the largest one and keeps what no collection holds apart', () => {
    const { rows, otherCents } = collectionShares([
      { slug: 'night', name: 'Night', posters: 89, cents: 365200 },
      { slug: 'primary', name: 'Primary', posters: 112, cents: 480700 },
      { slug: 'pastel', name: 'Pastel', posters: 0, cents: 0 },
    ], 850000)

    expect(rows.map(r => r.slug)).toEqual(['primary', 'night', 'pastel'])
    expect(rows[0]).toMatchObject({ bar: 1, share: 480700 / 850000 })
    expect(rows[1]!.bar).toBeCloseTo(365200 / 480700, 6)
    expect(rows[2]).toMatchObject({ bar: 0, share: 0 })
    expect(otherCents).toBe(850000 - 480700 - 365200)
    expect(collectionShares([], 0)).toEqual({ rows: [], otherCents: 0 })
  })
})
