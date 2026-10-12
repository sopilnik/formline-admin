import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getOrder } from '@/server/dal/orders'
import { lowStock } from '@/server/dal/overview'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { addNote } from '@/server/orders/notes'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, memberIds } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let workspaceId: string
let users: Record<string, string>

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  workspaceId = (await createSandbox(app)).workspaceId
  users = await memberIds(admin, workspaceId)
})
afterAll(closeAll)

const ctx = (role: 'owner' | 'manager' | 'viewer'): WorkspaceContext => ({ workspaceId, userId: users[role]!, role })
const read = <T>(fn: Parameters<typeof withWorkspace<T>>[1]) => withWorkspace(ctx('viewer'), fn, app)
const actor = (role: 'owner' | 'manager' | 'viewer') => ({ workspaceId, userId: users[role]!, role, ipHash: null })

describe('getOrder', () => {
  it('reads an order with its customer, lines, products and history, oldest first', async () => {
    const [row] = (await admin.query<{ id: string; number: number; city: string }>(
      "select o.id, o.number, c.city from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id where o.workspace_id = $1 and o.status = 'delivered' order by o.number limit 1",
      [workspaceId])).rows
    const order = (await read(tx => getOrder(tx, workspaceId, row!.number)))!
    expect(order).toMatchObject({ id: row!.id, number: row!.number, status: 'delivered' })
    expect(order.customer.city).toBe(row!.city)
    expect(order.address?.city).toBe(row!.city)
    const lines = await admin.query('select 1 from fa.order_lines where workspace_id = $1 and order_id = $2', [workspaceId, row!.id])
    expect(order.lines).toHaveLength(lines.rowCount!)
    for (const line of order.lines) expect(line.product?.imageSrc).toMatch(/^\/posters\/[a-z-]+\.webp$/)
    const statuses = order.history.filter(e => e.kind === 'status')
    expect(statuses[0]).toMatchObject({ from: null, to: 'paid', actorName: null })
    expect(statuses.at(-1)).toMatchObject({ from: 'shipped', to: 'delivered' })
    expect(statuses.at(-1)!.actorName).toMatch(/^(Noah Becker|Priya Nair)$/)
    for (let i = 1; i < order.history.length; i++) expect(order.history[i]!.at.getTime()).toBeGreaterThanOrEqual(order.history[i - 1]!.at.getTime())
  })

  it('flags a line the catalog does not know, and knows no order it does not hold', async () => {
    const [row] = (await admin.query<{ number: number; line_id: string }>(
      'select o.number, l.id as line_id from fa.orders o join fa.order_lines l on l.workspace_id = o.workspace_id and l.order_id = o.id where o.workspace_id = $1 order by o.number desc limit 1',
      [workspaceId])).rows
    await admin.query('update fa.order_lines set unmatched = true, variant_id = null, sku = null where workspace_id = $1 and id = $2', [workspaceId, row!.line_id])
    const order = (await read(tx => getOrder(tx, workspaceId, row!.number)))!
    expect(order.lines.find(line => line.id === row!.line_id)).toMatchObject({ unmatched: true, sku: null, product: null })
    expect(await read(tx => getOrder(tx, workspaceId, 999_999))).toBeNull()
  })
})

describe('addNote', () => {
  it('adds a note with its author to the history and logs it', async () => {
    const [row] = (await admin.query<{ id: string; number: number }>("select id, number from fa.orders where workspace_id = $1 and status = 'paid' order by number limit 1", [workspaceId])).rows
    expect(await addNote(actor('manager'), row!.id, 'Customer asked for a gift wrap.', app)).toBe(row!.number)
    const order = (await read(tx => getOrder(tx, workspaceId, row!.number)))!
    expect(order.history.at(-1)).toMatchObject({ kind: 'note', note: 'Customer asked for a gift wrap.', actorName: 'Priya Nair' })
    const log = await admin.query<{ actor_user_id: string; details: { number: number } }>(
      "select actor_user_id, details from fa.activity_log where workspace_id = $1 and action = 'order.note_added' and entity_id = $2", [workspaceId, row!.id])
    expect(log.rows).toEqual([{ actor_user_id: users.manager, details: { number: row!.number } }])
    expect(await addNote(actor('manager'), randomUUID(), 'Nobody reads this.', app)).toBeNull()
  })

  it('is refused for a viewer by row-level security', async () => {
    const [row] = (await admin.query<{ id: string }>('select id from fa.orders where workspace_id = $1 order by number limit 1', [workspaceId])).rows
    await expect(addNote(actor('viewer'), row!.id, 'Not allowed.', app)).rejects.toThrow()
  })
})

describe('lowStock', () => {
  it('lists the variants at or below their threshold, sold out first, at most five', async () => {
    const expected = await admin.query<{ id: string; stock: number }>(
      `select v.id, v.stock from fa.product_variants v join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id
        where v.workspace_id = $1 and v.stock <= v.low_stock_threshold and p.status <> 'archived' order by v.stock, p.name, v.sku`, [workspaceId])
    const result = await read(tx => lowStock(tx, workspaceId))
    expect(result.total).toBe(expected.rowCount)
    expect(result.rows.map(row => row.variantId)).toEqual(expected.rows.slice(0, 5).map(row => row.id))
    expect(result.rows[0]?.image?.storagePath).toMatch(/^posters\//)
  })
})
