import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOMERS_QUERY, type CustomersQuery } from '@/lib/customers/query'
import { listCustomers } from '@/server/dal/customers'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: WorkspaceContext
let viewer: WorkspaceContext
let other: WorkspaceContext

async function sandbox(): Promise<WorkspaceContext> {
  const { workspaceId, userId } = await createSandbox(app)
  return { workspaceId, userId, role: 'owner' }
}

type Facts = { id: string; orders: number; spent: number; last: Date | null }

/** Every customer's figures, computed on the admin pool from the same rows. */
async function facts(workspaceId: string): Promise<Map<string, Facts>> {
  const { rows } = await admin.query<Facts>(
    `select c.id, count(o.id)::int as orders,
            coalesce(sum(o.total_cents) filter (where o.status in ('paid', 'processing', 'shipped', 'delivered')), 0)::int as spent,
            max(o.placed_at) as last
       from fa.customers c
       left join fa.orders o on o.workspace_id = c.workspace_id and o.customer_id = c.id
      where c.workspace_id = $1
      group by c.id`, [workspaceId])
  return new Map(rows.map(r => [r.id, r]))
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  owner = await sandbox()
  other = await sandbox()
  const v = await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])
  viewer = { workspaceId: owner.workspaceId, userId: v.rows[0]!.id, role: 'viewer' }
  // Customers the template does not have: a Cyrillic name, and one only the other sandbox holds.
  await admin.query("insert into fa.customers (workspace_id, email, name, city, country) values ($1, 'olga.smirnova@example.ru', 'Ольга Смирнова', 'Riga', 'LV')", [owner.workspaceId])
  await admin.query("insert into fa.customers (workspace_id, email, name) values ($1, 'only.there@example.test', 'Only There')", [other.workspaceId])
})
afterAll(closeAll)

const list = (query: Partial<CustomersQuery>, ctx = owner) => withWorkspace(ctx, tx => listCustomers(tx, ctx.workspaceId, { ...DEFAULT_CUSTOMERS_QUERY, ...query }), app)

/** Every row of every page, in order. */
async function allPages(query: Partial<CustomersQuery>): Promise<string[]> {
  const first = await list({ ...query, size: 25 })
  const ids = first.rows.map(r => r.id)
  for (let page = 2; page <= first.pages; page++) ids.push(...(await list({ ...query, size: 25, page })).rows.map(r => r.id))
  return ids
}

describe('listCustomers', () => {
  it('lists every customer with their orders, the revenue they brought and their latest order, latest first', async () => {
    const expected = await facts(owner.workspaceId)
    const page = await list({ size: 100 })
    expect(page.total).toBe(expected.size)
    expect(page.filtered).toBe(expected.size)
    expect(page.pages).toBe(Math.ceil(expected.size / 100))
    for (const row of page.rows) {
      const fact = expected.get(row.id)!
      expect(row.orders, row.name).toBe(fact.orders)
      expect(row.spentCents, row.name).toBe(fact.spent)
      expect(row.lastOrderAt?.getTime() ?? null, row.name).toBe(fact.last?.getTime() ?? null)
    }
    const dates = page.rows.map(r => r.lastOrderAt?.getTime() ?? -Infinity)
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
  })

  it('puts the customers without orders last, in both directions', async () => {
    const withoutOrders = [...(await facts(owner.workspaceId)).values()].filter(f => f.orders === 0).length
    expect(withoutOrders).toBeGreaterThan(1)
    for (const dir of ['asc', 'desc'] as const) {
      const ids = await allPages({ sort: 'last', dir })
      const tail = ids.slice(-withoutOrders)
      const expected = await facts(owner.workspaceId)
      expect(tail.every(id => expected.get(id)!.orders === 0), dir).toBe(true)
    }
  })

  it('finds a part of the name or the email in any case, Cyrillic included', async () => {
    const byName = await list({ q: 'смирн' })
    expect(byName.rows.map(r => r.email)).toEqual(['olga.smirnova@example.ru'])
    expect([byName.filtered, byName.total]).toEqual([1, (await facts(owner.workspaceId)).size])
    const byEmail = await list({ q: 'SMIRNOVA@EXAMPLE' })
    expect(byEmail.rows.map(r => r.name)).toEqual(['Ольга Смирнова'])
    const expectedCarters = (await admin.query<{ n: number }>(
      "select count(*)::int as n from fa.customers where workspace_id = $1 and (name ilike '%carter%' or email ilike '%carter%')", [owner.workspaceId])).rows[0]!.n
    expect(expectedCarters).toBeGreaterThan(0)
    expect((await list({ q: 'Carter' })).filtered).toBe(expectedCarters)
    expect((await list({ q: '%' })).filtered).toBe(0)
  })

  it('sorts by name in the Unicode order, and by orders and spending with the name breaking ties', async () => {
    const byName = (await admin.query<{ id: string }>(
      'select id from fa.customers where workspace_id = $1 order by name collate "unicode", id', [owner.workspaceId])).rows.map(r => r.id)
    expect(await allPages({ sort: 'name', dir: 'asc' })).toEqual(byName)
    const expected = await facts(owner.workspaceId)
    const spent = (await allPages({ sort: 'spent', dir: 'desc' })).map(id => expected.get(id)!.spent)
    expect(spent).toEqual([...spent].sort((a, b) => b - a))
    const orders = (await allPages({ sort: 'orders', dir: 'asc' })).map(id => expected.get(id)!.orders)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('pages without overlaps or gaps under every sort', async () => {
    const total = (await facts(owner.workspaceId)).size
    for (const sort of ['name', 'orders', 'spent', 'last'] as const) {
      const ids = await allPages({ sort, dir: 'desc' })
      expect(ids, sort).toHaveLength(total)
      expect(new Set(ids).size, sort).toBe(total)
    }
    const last = await list({ size: 25, page: 99 })
    expect(last.rows).toEqual([])
    expect(last.pages).toBe(Math.ceil(total / 25))
  })

  it('shows every role the workspace’s own customers only', async () => {
    const seen = await list({ q: 'only.there' }, viewer)
    expect(seen.filtered).toBe(0)
    const there = await list({ q: 'only.there' }, other)
    expect(there.rows.map(r => r.name)).toEqual(['Only There'])
    expect((await list({ q: 'smirnova' }, other)).filtered).toBe(0)
  })
})
