import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { searchWorkspace } from '@/server/dal/search'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let box: WorkspaceContext
let other: WorkspaceContext

async function sandbox(): Promise<WorkspaceContext> {
  const { workspaceId, userId } = await createSandbox(app)
  return { workspaceId, userId, role: 'owner' }
}

const search = (ctx: WorkspaceContext, term: string) => withWorkspace(ctx, tx => searchWorkspace(tx, ctx.workspaceId, term), app)

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  box = await sandbox()
  other = await sandbox()
})
afterAll(closeAll)

describe('searchWorkspace', () => {
  it('finds an order by its number, with or without the sign', async () => {
    const [order] = (await admin.query<{ number: number; name: string; total_cents: number; status: string }>(
      `select o.number, c.name, o.total_cents, o.status from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id
        where o.workspace_id = $1 order by o.placed_at limit 1`, [box.workspaceId])).rows
    const plain = await search(box, String(order!.number))
    expect(plain.orders).toEqual([{ number: order!.number, customer: order!.name, totalCents: order!.total_cents, status: order!.status }])
    expect((await search(box, `#${order!.number}`)).orders).toEqual(plain.orders)
  })

  it('finds a customer\'s orders by a part of the email, newest first, five at most', async () => {
    const [customer] = (await admin.query<{ email: string }>(
      `select c.email from fa.customers c where c.workspace_id = $1
        and (select count(*) from fa.orders o where o.workspace_id = c.workspace_id and o.customer_id = c.id) > 5
        order by c.email limit 1`, [box.workspaceId])).rows
    const part = customer!.email.split('@')[0]!.toUpperCase()
    const expected = (await admin.query<{ number: number }>(
      `select o.number from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id
        where o.workspace_id = $1 and c.email ilike $2 order by o.placed_at desc, o.id desc limit 5`, [box.workspaceId, `%${part}%`])).rows
    const found = await search(box, part)
    expect(found.orders.map(o => o.number)).toEqual(expected.map(o => o.number))
    expect(found.orders).toHaveLength(5)
  })

  it('finds customers by name or email and products by name or slug, by name', async () => {
    const found = await search(box, 'or')
    const customers = (await admin.query<{ id: string; name: string; email: string }>(
      `select id, name, email from fa.customers where workspace_id = $1 and (name ilike '%or%' or email ilike '%or%')
        order by name collate "unicode", id limit 5`, [box.workspaceId])).rows
    const products = (await admin.query<{ slug: string; name: string; status: string }>(
      `select slug, name, status from fa.products where workspace_id = $1 and (name ilike '%or%' or slug ilike '%or%')
        order by name collate "unicode", id limit 5`, [box.workspaceId])).rows
    expect(found.customers).toEqual(customers)
    expect(found.products).toEqual(products)
    expect(found.products.length).toBeGreaterThan(0)
    const [bySlug] = (await admin.query<{ slug: string }>("select slug from fa.products where workspace_id = $1 and slug like '%-%' order by slug limit 1", [box.workspaceId])).rows
    expect((await search(box, bySlug!.slug)).products.map(p => p.slug)).toContain(bySlug!.slug)
  })

  it('takes %, _ and \\ literally and stays inside its workspace', async () => {
    expect(await search(box, '%%')).toEqual({ orders: [], customers: [], products: [] })
    expect(await search(box, '__')).toEqual({ orders: [], customers: [], products: [] })
    await admin.query("update fa.customers set name = 'Zephyrine Quillfeather' where workspace_id = $1 and id = (select id from fa.customers where workspace_id = $1 order by id limit 1)", [other.workspaceId])
    expect((await search(other, 'Quillfeather')).customers).toHaveLength(1)
    expect((await search(box, 'Quillfeather')).customers).toEqual([])
  })
})
