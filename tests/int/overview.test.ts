import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bucketSums } from '@/lib/overview/kpi'
import { periodPlan, PERIODS, type Range } from '@/lib/periods'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { attentionCounts, collectionRevenue, revenuePoints, revenueTotals } from '@/server/dal/overview'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'

let admin: pg.Pool
let app: pg.Pool
let ctx: WorkspaceContext
const tz = 'Europe/Berlin'
const now = new Date()
const REVENUE = "('paid', 'processing', 'shipped', 'delivered')"

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  const { rows } = await app.query<{ outcome: string; sandbox_id: string; demo_user_id: string }>(
    'select outcome, sandbox_id, demo_user_id from fa.create_sandbox($1, $2, $3, $4)',
    [createHash('sha256').update(randomUUID()).digest('hex'), hashToken(generateToken()), 'Vitest', 'en'])
  expect(rows[0]?.outcome).toBe('created')
  ctx = { workspaceId: rows[0]!.sandbox_id, userId: rows[0]!.demo_user_id, role: 'viewer' }
})
afterAll(closeAll)

const read = <T>(fn: Parameters<typeof withWorkspace<T>>[1]) => withWorkspace(ctx, fn, app)
const one = async (text: string, params: unknown[]) => Number((await admin.query<{ n: string }>(text, params)).rows[0]!.n)

describe('revenueTotals', () => {
  it('follows the spec definitions for the current and the previous 30 days', async () => {
    const plan = periodPlan('30d', now, tz)
    for (const range of [plan.current, plan.previous]) {
      const totals = await read(tx => revenueTotals(tx, ctx.workspaceId, range))
      const inRange = `o.workspace_id = $1 and o.status in ${REVENUE} and o.placed_at >= $2 and o.placed_at < $3`
      expect(totals.revenueCents).toBe(await one(`select coalesce(sum(o.total_cents), 0) as n from fa.orders o where ${inRange}`, [ctx.workspaceId, range.start, range.end]))
      expect(totals.orders).toBe(await one(`select count(*) as n from fa.orders o where ${inRange}`, [ctx.workspaceId, range.start, range.end]))
      // Written differently on purpose: a customer with a revenue order in the range and none before it.
      expect(totals.newCustomers).toBe(await one(
        `select count(distinct o.customer_id) as n from fa.orders o where ${inRange}
           and not exists (select 1 from fa.orders e where e.workspace_id = o.workspace_id and e.customer_id = o.customer_id
                            and e.status in ${REVENUE} and e.placed_at < $2)`, [ctx.workspaceId, range.start, range.end]))
      expect(totals.orders).toBeGreaterThan(0)
    }
  })
})

describe('revenuePoints in the plan buckets', () => {
  it.each(PERIODS)('add up to the revenue KPI and its previous value (%s)', async period => {
    const plan = periodPlan(period, now, tz)
    const span: Range = { start: plan.previous.start, end: plan.current.end }
    const points = await read(tx => revenuePoints(tx, ctx.workspaceId, span))
    const current = await read(tx => revenueTotals(tx, ctx.workspaceId, plan.current))
    const previous = await read(tx => revenueTotals(tx, ctx.workspaceId, plan.previous))
    const sum = (values: (number | null)[]) => values.reduce<number>((total, v) => total + (v ?? 0), 0)
    expect(sum(bucketSums(points, plan.buckets))).toBe(current.revenueCents)
    expect(sum(bucketSums(points, plan.previousBuckets))).toBe(previous.revenueCents)
  })
})

describe('collectionRevenue', () => {
  it('splits the posters by collection, and posters plus shipping make the revenue', async () => {
    const range = periodPlan('90d', now, tz).current
    const result = await read(tx => collectionRevenue(tx, ctx.workspaceId, range))
    const totals = await read(tx => revenueTotals(tx, ctx.workspaceId, range))
    expect(result.postersCents + result.shippingCents).toBe(totals.revenueCents)
    expect(result.rows.map(r => r.slug).sort()).toEqual(['monochrome', 'night', 'pastel', 'primary'])
    expect(result.rows.reduce((total, r) => total + r.cents, 0)).toBe(result.postersCents)   // every seed line is matched
    const lines = await one(
      `select coalesce(sum(l.qty), 0) as n from fa.orders o join fa.order_lines l on l.workspace_id = o.workspace_id and l.order_id = o.id
        where o.workspace_id = $1 and o.status in ${REVENUE} and o.placed_at >= $2 and o.placed_at < $3`, [ctx.workspaceId, range.start, range.end])
    expect(result.rows.reduce((total, r) => total + r.posters, 0)).toBe(lines)
  })
})

describe('attentionCounts', () => {
  it('counts the orders to process, those in processing and the sold-out variants', async () => {
    const counts = await read(tx => attentionCounts(tx, ctx.workspaceId))
    expect(counts.toProcess).toBe(await one("select count(*) as n from fa.orders where workspace_id = $1 and status = 'paid'", [ctx.workspaceId]))
    expect(counts.processing).toBe(await one("select count(*) as n from fa.orders where workspace_id = $1 and status = 'processing'", [ctx.workspaceId]))
    expect(counts.soldOut).toBe(await one(
      "select count(*) as n from fa.product_variants v join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id where v.workspace_id = $1 and v.stock = 0 and p.status <> 'archived'",
      [ctx.workspaceId]))
    expect(counts.toProcess).toBeGreaterThanOrEqual(12)
  })
})
