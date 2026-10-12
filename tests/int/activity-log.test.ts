import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_ACTIVITY_QUERY, type ActivityQuery } from '@/lib/activity/query'
import { listActivity } from '@/server/dal/activity'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, memberIds } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: WorkspaceContext
let ids: Record<'owner' | 'admin' | 'manager' | 'viewer', string>
const tz = 'Europe/Berlin'
const now = new Date()

async function entry(input: { actor: string | null; action: string; entityType?: string; entityId?: string; details?: object; daysAgo?: number }): Promise<void> {
  await admin.query(
    'insert into fa.activity_log (workspace_id, actor_user_id, action, entity_type, entity_id, details, at) values ($1, $2, $3, $4, $5, $6, now() - make_interval(days => $7))',
    [owner.workspaceId, input.actor, input.action, input.entityType ?? null, input.entityId ?? null, JSON.stringify(input.details ?? {}), input.daysAgo ?? 0])
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  const { workspaceId, userId } = await createSandbox(app)
  owner = { workspaceId, userId, role: 'owner' }
  ids = await memberIds(admin, owner.workspaceId)
  const order = (await admin.query<{ id: string; number: number }>('select id, number from fa.orders where workspace_id = $1 order by number limit 1', [owner.workspaceId])).rows[0]!
  const product = (await admin.query<{ id: string }>("select id from fa.products where workspace_id = $1 and slug = 'far-orbit'", [owner.workspaceId])).rows[0]!
  await admin.query("update fa.products set name = 'Farther Orbit' where workspace_id = $1 and id = $2", [owner.workspaceId, product.id])
  await entry({ actor: ids.manager, action: 'order.status_changed', entityType: 'order', entityId: order.id, details: { number: order.number, from: 'paid', to: 'processing', bulk: false }, daysAgo: 10 })
  await entry({ actor: ids.admin, action: 'product.updated', entityType: 'product', entityId: product.id, details: { slug: 'far-orbit', changed: ['name'] }, daysAgo: 3 })
  await entry({ actor: ids.admin, action: 'product.deleted', entityType: 'product', entityId: randomUUID(), details: { slug: 'gone', name: 'Gone Poster', variants: 3 }, daysAgo: 2 })
  await entry({ actor: null, action: 'order.status_changed', entityType: 'order', entityId: order.id, details: { number: order.number, from: 'processing', to: 'shipped' }, daysAgo: 1 })
})
afterAll(closeAll)

const list = (query: Partial<ActivityQuery>, ctx = owner) =>
  withWorkspace(ctx, tx => listActivity(tx, ctx.workspaceId, { ...DEFAULT_ACTIVITY_QUERY, ...query }, now, tz), app)

describe('listActivity', () => {
  it('lists the workspace’s entries newest first, with the names the page needs', async () => {
    const page = await list({})
    // The four entries above and the sandbox's own first entry.
    expect(page.total).toBe(5)
    expect(page.rows.map(r => r.action)).toEqual(['sandbox.created', 'order.status_changed', 'product.deleted', 'product.updated', 'order.status_changed'])
    expect(page.members.map(m => m.name)).toEqual(['Dana Ortiz', 'Noah Becker', 'Priya Nair', 'Tomás Ferreira'])
    expect([...page.lookups.products.values()]).toEqual([{ slug: 'far-orbit', name: 'Farther Orbit' }])
    expect(page.lookups.orders.size).toBe(1)
  })

  it('filters by a member, by the system, by action and by period', async () => {
    expect((await list({ actor: ids.admin })).rows.map(r => r.action)).toEqual(['product.deleted', 'product.updated'])
    expect((await list({ actor: 'system' })).rows.map(r => r.details)).toEqual([expect.objectContaining({ to: 'shipped' })])
    const statuses = await list({ action: 'order.status_changed' })
    expect([statuses.filtered, statuses.total]).toEqual([2, 5])
    expect((await list({ when: '7d' })).filtered).toBe(4)
    expect((await list({ when: 'today' })).rows.map(r => r.action)).toEqual(['sandbox.created'])
  })

  it('pages the log', async () => {
    for (let i = 0; i < 26; i++) await entry({ actor: ids.owner, action: 'auth.sign_in', details: { method: 'password' }, daysAgo: 20 })
    const first = await list({})
    expect([first.filtered, first.pages, first.rows.length]).toEqual([31, 2, 25])
    const second = await list({ page: 2 })
    expect(second.rows).toHaveLength(6)
    expect(second.rows.some(row => first.rows.some(r => r.id === row.id))).toBe(false)
  })

  it('shows nothing to a manager', async () => {
    const manager = { ...owner, userId: ids.manager, role: 'manager' as const }
    const page = await list({}, manager)
    expect([page.total, page.rows]).toEqual([0, []])
  })
})
