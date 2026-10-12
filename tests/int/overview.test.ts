import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bucketSums } from '@/lib/overview/kpi'
import { periodPlan, PERIODS, type Range } from '@/lib/periods'
import { attentionCounts, collectionRevenue, lowStock, revenuePoints, revenueTotals } from '@/server/dal/overview'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, placeOrder } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let ctx: WorkspaceContext
const tz = 'Europe/Berlin'
const now = new Date()
const REVENUE = "('paid', 'processing', 'shipped', 'delivered')"

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  const { workspaceId, userId } = await createSandbox(app)
  ctx = { workspaceId, userId, role: 'viewer' }
})
afterAll(closeAll)

const read = <T>(fn: Parameters<typeof withWorkspace<T>>[1]) => withWorkspace(ctx, fn, app)
const one = async (text: string, params: unknown[]) => Number((await admin.query<{ n: string }>(text, params)).rows[0]!.n)

/** A sandbox of its own whose seed orders all lie two years back, delivered: a test adds the rows it counts. */
async function cleared(): Promise<WorkspaceContext> {
  const { workspaceId, userId } = await createSandbox(app)
  await admin.query("update fa.orders set placed_at = placed_at - interval '2 years', status = 'delivered' where workspace_id = $1", [workspaceId])
  return { workspaceId, userId, role: 'viewer' }
}

const newCustomer = async (workspaceId: string, email: string) => (await admin.query<{ id: string }>(
  "insert into fa.customers (workspace_id, email, name) values ($1, $2, 'Hand Built') returning id", [workspaceId, email])).rows[0]!.id

describe('revenueTotals', () => {
  it('counts from the range start up to its end, leaves cancelled and refunded orders out, and calls a buyer new once', async () => {
    const built = await cleared()
    const range = periodPlan('30d', now, tz).current
    const returning = await newCustomer(built.workspaceId, 'returning@hand.test')
    const first = await newCustomer(built.workspaceId, 'first@hand.test')
    const place = (number: number, customerId: string, status: string, subtotalCents: number, placedAt: Date) =>
      placeOrder(admin, built.workspaceId, { number, customerId, status, subtotalCents, placedAt })

    await place(90001, returning, 'paid', 2000, new Date(range.start.getTime() - 1))
    await place(90002, returning, 'paid', 2900, range.start)
    await place(90003, first, 'delivered', 4100, new Date(range.end.getTime() - 1))
    await place(90004, first, 'cancelled', 1000, range.start)
    await place(90005, first, 'refunded', 1000, range.start)
    await place(90006, first, 'paid', 1000, range.end)

    expect(await withWorkspace(built, tx => revenueTotals(tx, built.workspaceId, range), app)).toEqual({ revenueCents: 3800 + 5000, orders: 2, newCustomers: 1 })
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
  it('counts the orders to process and in processing, and the sold-out variants of the products still sold', async () => {
    const built = await cleared()
    const ws = built.workspaceId
    await admin.query("update fa.orders set status = 'paid' where workspace_id = $1 and number in (select number from fa.orders where workspace_id = $1 order by number limit 2)", [ws])
    await admin.query("update fa.orders set status = 'processing' where workspace_id = $1 and number = (select max(number) from fa.orders where workspace_id = $1)", [ws])
    await admin.query('update fa.product_variants set stock = 5 where workspace_id = $1', [ws])
    // One sold-out variant of a product on sale counts; the sold-out variants of an archived product do not.
    await admin.query("update fa.product_variants set stock = 0 where workspace_id = $1 and sku = 'far-orbit-a2-ink'", [ws])
    await admin.query("update fa.products set status = 'archived' where workspace_id = $1 and slug = 'hush'", [ws])
    await admin.query("update fa.product_variants v set stock = 0 from fa.products p where p.workspace_id = v.workspace_id and p.id = v.product_id and v.workspace_id = $1 and p.slug = 'hush'", [ws])

    expect(await withWorkspace(built, tx => attentionCounts(tx, ws), app)).toEqual({ toProcess: 2, processing: 1, soldOut: 1 })
  })
})

describe('lowStock', () => {
  it('lists the lowest stock first and the names in the Unicode order, as the other lists', async () => {
    // Every variant out of stock, and one poster named in lower case: the byte order would put it after every capital.
    await admin.query('update fa.product_variants set stock = 0 where workspace_id = $1', [ctx.workspaceId])
    await admin.query("update fa.products set name = 'aardvark' where workspace_id = $1 and slug = 'hush'", [ctx.workspaceId])
    const { rows } = await read(tx => lowStock(tx, ctx.workspaceId))
    expect(rows[0]!.productName).toBe('aardvark')
  })
})
