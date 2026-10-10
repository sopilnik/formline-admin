import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/actor'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { saveCustomerNotes } from '@/server/customers/notes'
import { CUSTOMER_ORDERS_SHOWN, getCustomer } from '@/server/dal/customers'
import { withWorkspace } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'

let admin: pg.Pool
let app: pg.Pool
let owner: Actor
let manager: Actor
let viewer: Actor
let other: Actor

async function sandbox(): Promise<Actor> {
  const { rows } = await app.query<{ outcome: string; sandbox_id: string; demo_user_id: string }>(
    'select outcome, sandbox_id, demo_user_id from fa.create_sandbox($1, $2, $3, $4)',
    [createHash('sha256').update(randomUUID()).digest('hex'), hashToken(generateToken()), 'Vitest', 'en'])
  expect(rows[0]?.outcome).toBe('created')
  return { workspaceId: rows[0]!.sandbox_id, userId: rows[0]!.demo_user_id, role: 'owner', ipHash: 'ip-hash-of-the-test' }
}

async function member(actor: Actor, role: 'manager' | 'viewer'): Promise<Actor> {
  const { rows } = await admin.query<{ id: string }>('select id from fa.users where workspace_id = $1 and role = $2', [actor.workspaceId, role])
  return { ...actor, userId: rows[0]!.id, role }
}

/** The customer with the most orders, so the list and the figures have something to show. */
async function busiest(workspaceId: string): Promise<{ id: string; name: string; orders: number }> {
  const { rows } = await admin.query<{ id: string; name: string; orders: number }>(
    `select c.id, c.name, count(o.id)::int as orders from fa.customers c
       join fa.orders o on o.workspace_id = c.workspace_id and o.customer_id = c.id
      where c.workspace_id = $1 group by c.workspace_id, c.id order by count(o.id) desc, c.id limit 1`, [workspaceId])
  return rows[0]!
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  owner = await sandbox()
  other = await sandbox()
  manager = await member(owner, 'manager')
  viewer = await member(owner, 'viewer')
})
afterAll(closeAll)

const read = (id: string, actor: Actor = owner) => withWorkspace(actor, tx => getCustomer(tx, actor.workspaceId, id), app)

const notesOf = async (id: string, workspaceId = owner.workspaceId) =>
  (await admin.query<{ notes: string }>('select notes from fa.customers where workspace_id = $1 and id = $2', [workspaceId, id])).rows[0]!.notes

const logged = async (id: string) => (await admin.query<{ action: string; actor: string; details: { name: string }; ip_hash: string }>(
  "select action, actor_user_id as actor, details, ip_hash from fa.activity_log where workspace_id = $1 and entity_type = 'customer' and entity_id = $2 order by at",
  [owner.workspaceId, id])).rows

describe('getCustomer', () => {
  it('reads the customer with the figures of the list and the latest orders first', async () => {
    const { id, orders } = await busiest(owner.workspaceId)
    const customer = (await read(id))!
    const { rows } = await admin.query<{ orders: number; revenue: number; spent: number; first: Date; last: Date }>(
      `select count(*)::int as orders,
              (count(*) filter (where status in ('paid', 'processing', 'shipped', 'delivered')))::int as revenue,
              coalesce(sum(total_cents) filter (where status in ('paid', 'processing', 'shipped', 'delivered')), 0)::int as spent,
              min(placed_at) as first, max(placed_at) as last
         from fa.orders where workspace_id = $1 and customer_id = $2`, [owner.workspaceId, id])
    const expected = rows[0]!
    expect([customer.orders, customer.revenueOrders, customer.spentCents]).toEqual([expected.orders, expected.revenue, expected.spent])
    expect([customer.firstOrderAt?.getTime(), customer.lastOrderAt?.getTime()]).toEqual([expected.first.getTime(), expected.last.getTime()])
    expect(customer.recent).toHaveLength(Math.min(orders, CUSTOMER_ORDERS_SHOWN))
    const placed = customer.recent.map(o => o.placedAt.getTime())
    expect(placed).toEqual([...placed].sort((a, b) => b - a))
    expect(customer.recent[0]!.placedAt.getTime()).toBe(expected.last.getTime())
  })

  it('reads a customer without orders, and nothing for an id the workspace does not hold', async () => {
    const { rows } = await admin.query<{ id: string }>(
      "insert into fa.customers (workspace_id, email, name) values ($1, 'no.orders@example.test', 'No Orders') returning id", [owner.workspaceId])
    const lonely = (await read(rows[0]!.id))!
    expect([lonely.orders, lonely.spentCents, lonely.firstOrderAt, lonely.lastOrderAt, lonely.recent]).toEqual([0, 0, null, null, []])
    expect(await read(randomUUID())).toBeNull()
    expect(await read(rows[0]!.id, other)).toBeNull()
  })
})

describe('saveCustomerNotes', () => {
  it('saves the notes and logs the change with the customer’s name', async () => {
    const { id, name } = await busiest(owner.workspaceId)
    expect(await saveCustomerNotes(manager, id, 'Prefers express.\nCall before delivery.', app)).toBe('saved')
    expect(await notesOf(id)).toBe('Prefers express.\nCall before delivery.')
    expect(await logged(id)).toEqual([{ action: 'customer.notes_updated', actor: manager.userId, details: { name }, ip_hash: 'ip-hash-of-the-test' }])
  })

  it('writes and logs nothing when the notes did not change', async () => {
    const { id } = await busiest(owner.workspaceId)
    const before = (await logged(id)).length
    await saveCustomerNotes(owner, id, 'Same text', app)
    expect(await saveCustomerNotes(owner, id, 'Same text', app)).toBe('unchanged')
    expect((await logged(id)).length).toBe(before + 1)
  })

  it('refuses a viewer and changes nothing', async () => {
    const { id } = await busiest(owner.workspaceId)
    const before = await notesOf(id)
    const entries = (await logged(id)).length
    expect(await saveCustomerNotes(viewer, id, 'Viewer was here', app)).toBe('not_found')
    expect(await notesOf(id)).toBe(before)
    expect((await logged(id)).length).toBe(entries)
  })

  it('writes only the workspace’s own copy of a customer', async () => {
    // Sandboxes copy the template with its ids: the other sandbox holds a customer with the same id.
    const { id } = await busiest(owner.workspaceId)
    const before = await notesOf(id)
    expect(await saveCustomerNotes(other, id, 'Another sandbox', app)).toBe('saved')
    expect(await notesOf(id, other.workspaceId)).toBe('Another sandbox')
    expect(await notesOf(id)).toBe(before)
    const { rows } = await admin.query<{ id: string }>(
      "insert into fa.customers (workspace_id, email, name) values ($1, 'only.here@example.test', 'Only Here') returning id", [owner.workspaceId])
    expect(await saveCustomerNotes(other, rows[0]!.id, 'Not theirs', app)).toBe('not_found')
    expect(await notesOf(rows[0]!.id)).toBe('')
  })
})
