import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_ORDERS_QUERY, type OrdersQuery } from '@/lib/orders/query'
import { changeOrderStatus, listOrders } from '@/server/dal/orders'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, placeOrder } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: WorkspaceContext
let viewer: WorkspaceContext
const now = new Date()
const tz = 'Europe/Berlin'

beforeAll(async () => {
  admin = adminPool()
  app = appPool()

  const { workspaceId, userId } = await createSandbox(app)

  owner = { workspaceId, userId, role: 'owner' }

  const v = await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])

  viewer = { workspaceId: owner.workspaceId, userId: v.rows[0]!.id, role: 'viewer' }
})
afterAll(closeAll)

const list = (query: Partial<OrdersQuery>, ctx = owner) => withWorkspace(ctx, tx => listOrders(tx, ctx.workspaceId, { ...DEFAULT_ORDERS_QUERY, ...query }, now, tz), app)

const countWhere = async (where: string, params: unknown[] = []) =>
  Number((await admin.query<{ n: string }>(`select count(*) as n from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id where o.workspace_id = $1 and (${where})`, [owner.workspaceId, ...params])).rows[0]!.n)

describe('listOrders', () => {
  it('pages the newest orders first by default and counts everything', async () => {
    const page = await list({})

    expect(page.rows).toHaveLength(25)
    expect(page.total).toBe(await countWhere('true'))
    expect(page.filtered).toBe(page.total)
    expect(page.pages).toBe(Math.ceil(page.total / 25))
    for (let i = 1; i < page.rows.length; i++) expect(page.rows[i - 1]!.placedAt.getTime()).toBeGreaterThanOrEqual(page.rows[i]!.placedAt.getTime())
    expect(Object.values(page.statusCounts).reduce((a, b) => a + b, 0)).toBe(page.total)

    const first = page.rows[0]!

    expect(first.items).toBe(Number((await admin.query<{ n: string }>('select sum(qty) as n from fa.order_lines where workspace_id = $1 and order_id = $2', [owner.workspaceId, first.id])).rows[0]!.n))
    expect(first.customerEmail).toContain('@')
  })

  it('filters by status and keeps the chip counts free of the status filter', async () => {
    const page = await list({ status: ['paid', 'processing'] })

    expect(page.filtered).toBe(await countWhere("o.status in ('paid', 'processing')"))
    expect(page.rows.every(r => r.status === 'paid' || r.status === 'processing')).toBe(true)
    expect(page.statusCounts.paid).toBe(await countWhere("o.status = 'paid'"))
    expect(page.statusCounts.delivered).toBe(await countWhere("o.status = 'delivered'"))
  })

  it('searches by exact number and by a fragment of the name or email', async () => {
    const byNumber = await list({ q: '1300' })

    expect(byNumber.rows.map(r => r.number)).toEqual([1300])

    const fragment = byNumber.rows[0]!.customerName.slice(0, 4).toUpperCase()
    const byName = await list({ q: fragment, size: 100 })

    expect(byName.filtered).toBe(await countWhere('c.email ilike $2 or c.name ilike $2', [`%${fragment}%`]))
    expect(byName.rows.every(r => r.customerEmail.toUpperCase().includes(fragment) || r.customerName.toUpperCase().includes(fragment))).toBe(true)

    const nobody = await list({ q: 'nobody@nowhere.invalid' })

    expect(nobody.rows).toEqual([])
    expect(nobody.filtered).toBe(0)
    expect(nobody.pages).toBe(1)
  })

  it('starts today and the last seven days at midnight in the store zone', async () => {
    const { workspaceId, userId } = await createSandbox(app)
    const built: WorkspaceContext = { workspaceId, userId, role: 'owner' }

    await admin.query("update fa.orders set placed_at = placed_at - interval '2 years' where workspace_id = $1", [workspaceId])

    // Both midnights as the database works them out from the same instant, apart from the code under test.
    const { rows } = await admin.query<{ today: Date; week: Date }>(
      `select date_trunc('day', $1::timestamptz at time zone $2) at time zone $2 as today,
              (date_trunc('day', $1::timestamptz at time zone $2) - interval '6 days') at time zone $2 as week`, [now, tz])
    const { today, week } = rows[0]!
    const customerId = (await admin.query<{ id: string }>('select id from fa.customers where workspace_id = $1 limit 1', [workspaceId])).rows[0]!.id
    const before = (date: Date) => new Date(date.getTime() - 1)

    for (const [number, placedAt] of [[90001, today], [90002, before(today)], [90003, week], [90004, before(week)]] as const) {
      await placeOrder(admin, workspaceId, { number, customerId, status: 'paid', subtotalCents: 1000, placedAt })
    }

    const placed = async (preset: OrdersQuery['placed']) => (await list({ placed: preset }, built)).filtered

    expect(await placed('today')).toBe(1)
    expect(await placed('7d')).toBe(3)
  })

  it('filters by source', async () => {
    expect((await list({ source: 'stripe' })).filtered).toBe(await countWhere("o.source = 'stripe'"))
    expect((await list({ source: 'seed' })).filtered).toBe(await countWhere("o.source = 'seed'"))
  })

  it('sorts by total and pages', async () => {
    const page = await list({ sort: 'total', dir: 'asc', page: 2, size: 50 })
    const expected = await admin.query<{ id: string }>('select id from fa.orders where workspace_id = $1 order by total_cents asc, id asc offset 50 limit 50', [owner.workspaceId])

    expect(page.rows.map(r => r.id)).toEqual(expected.rows.map(r => r.id))
    expect(page.page).toBe(2)
  })

  it('finds an order typed with its "#", and a whole email only in its own orders, not in the emails that contain it', async () => {
    expect((await list({ q: '#1300' })).rows.map(r => r.number)).toEqual([1300])

    const customer = async (name: string, email: string) => (await admin.query<{ id: string }>(
      'insert into fa.customers (workspace_id, name, email) values ($1, $2, $3) returning id', [owner.workspaceId, name, email])).rows[0]!.id
    const ann = await customer('Ann Berg', 'ann@qa2-mail.test')
    const joann = await customer('Joann Lund', 'joann@qa2-mail.test')

    await placeOrder(admin, owner.workspaceId, { number: 91004, customerId: ann, status: 'paid', subtotalCents: 3000, placedAt: now })
    await placeOrder(admin, owner.workspaceId, { number: 91005, customerId: joann, status: 'paid', subtotalCents: 3000, placedAt: now })
    expect((await list({ q: 'ann@qa2-mail.test' })).rows.map(r => r.number)).toEqual([91004])
    expect((await list({ q: 'ANN@QA2-mail.test' })).rows.map(r => r.number)).toEqual([91004])
    expect((await list({ q: 'qa2-mail' })).rows.map(r => r.number).sort((a, b) => a - b)).toEqual([91004, 91005])
  })
})

describe('changeOrderStatus', () => {
  const paidOrder = async () => (await admin.query<{ id: string; number: number }>(
    "select o.id, o.number from fa.orders o where o.workspace_id = $1 and o.status = 'paid' and exists (select 1 from fa.order_lines l where l.workspace_id = o.workspace_id and l.order_id = o.id and l.variant_id is not null) order by o.number limit 1",
    [owner.workspaceId])).rows[0]!
  const stockOf = async (orderId: string) => (await admin.query<{ variant_id: string; stock: number; qty: number }>(
    'select l.variant_id, v.stock, l.qty from fa.order_lines l join fa.product_variants v on v.workspace_id = l.workspace_id and v.id = l.variant_id where l.workspace_id = $1 and l.order_id = $2 order by l.variant_id',
    [owner.workspaceId, orderId])).rows
  const change = (ctx: WorkspaceContext, orderId: string, to: Parameters<typeof changeOrderStatus>[2]['to']) =>
    withWorkspace(ctx, tx => changeOrderStatus(tx, { workspaceId: ctx.workspaceId, userId: ctx.userId! }, { orderId, to }), app)

  it('moves a paid order to processing, writes the event and returns the stock on a later cancellation', async () => {
    const order = await paidOrder()
    const before = await stockOf(order.id)

    expect(await change(owner, order.id, 'processing')).toEqual({ ok: true, number: order.number, from: 'paid', to: 'processing' })

    const events = await admin.query<{ from_status: string; to_status: string; actor_user_id: string }>(
      "select from_status, to_status, actor_user_id from fa.order_events where workspace_id = $1 and order_id = $2 and kind = 'status' order by at", [owner.workspaceId, order.id])

    expect(events.rows.at(-1)).toEqual({ from_status: 'paid', to_status: 'processing', actor_user_id: owner.userId })
    expect(await stockOf(order.id)).toEqual(before)
    expect(await change(owner, order.id, 'cancelled')).toMatchObject({ ok: true, from: 'processing', to: 'cancelled' })

    const after = await stockOf(order.id)

    for (const [i, line] of after.entries()) expect(line.stock).toBe(before[i]!.stock + line.qty)

    const updated = await admin.query<{ status: string; moved: boolean }>('select status, updated_at > placed_at as moved from fa.orders where workspace_id = $1 and id = $2', [owner.workspaceId, order.id])

    expect(updated.rows[0]).toEqual({ status: 'cancelled', moved: true })
  })

  it('does not return stock after shipping and refuses transitions the machine forbids', async () => {
    const shipped = (await admin.query<{ id: string; number: number }>("select id, number from fa.orders where workspace_id = $1 and status = 'shipped' order by number limit 1", [owner.workspaceId])).rows[0]!
    const before = await stockOf(shipped.id)

    expect(await change(owner, shipped.id, 'refunded')).toMatchObject({ ok: true, from: 'shipped', to: 'refunded' })
    expect(await stockOf(shipped.id)).toEqual(before)
    expect(await change(owner, shipped.id, 'processing')).toEqual({ ok: false, reason: 'invalid_transition', number: shipped.number, from: 'refunded', to: 'processing' })
    expect(await change(owner, randomUUID(), 'processing')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('finds nothing to lock for a viewer: row-level security applies the update policy to SELECT … FOR UPDATE', async () => {
    const order = await paidOrder()

    expect(await change(viewer, order.id, 'processing')).toEqual({ ok: false, reason: 'not_found' })

    const row = await admin.query<{ status: string }>('select status from fa.orders where workspace_id = $1 and id = $2', [owner.workspaceId, order.id])

    expect(row.rows[0]!.status).toBe('paid')
  })
})

describe('getStoreSettings', () => {
  it('reads the workspace row and falls back to the defaults', async () => {
    const settings = await withWorkspace(owner, tx => getStoreSettings(tx, owner.workspaceId), app)

    expect(settings.timezone).toBe('Europe/Berlin')
    expect(settings.lowStockDefault).toBeGreaterThan(0)
  })
})
