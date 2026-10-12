import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/actor'
import { changeStatuses } from '@/server/orders/change-status'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, memberIds } from './fixtures'

let admin: pg.Pool
let app: pg.Pool

async function sandbox(): Promise<{ workspaceId: string; users: Record<string, string> }> {
  const { workspaceId } = await createSandbox(app)
  return { workspaceId, users: await memberIds(admin, workspaceId) }
}

const actor = (workspaceId: string, userId: string, role: Actor['role']): Actor => ({ workspaceId, userId, role, ipHash: null })

const ordersWith = async (workspaceId: string, status: string, limit: number) =>
  (await admin.query<{ id: string; number: number }>('select id, number from fa.orders where workspace_id = $1 and status = $2 order by number limit $3', [workspaceId, status, limit])).rows

const newestFirst = (a: number, b: number) => b - a

beforeAll(() => {
  admin = adminPool()
  app = appPool()
})
afterAll(closeAll)

describe('changeStatuses (spec §8.2)', () => {
  it('moves the orders the machine allows, reports the others by number and logs every change', async () => {
    const { workspaceId, users } = await sandbox()
    const paid = await ordersWith(workspaceId, 'paid', 2)
    const [delivered] = await ordersWith(workspaceId, 'delivered', 1)
    const outcome = await changeStatuses(actor(workspaceId, users.manager!, 'manager'), [...paid.map(o => o.id), delivered!.id, delivered!.id], 'processing', app)
    expect(outcome).toEqual({ changed: paid.map(o => o.number).sort(newestFirst), skipped: [delivered!.number] })
    const statuses = await admin.query<{ id: string; status: string }>('select id, status from fa.orders where workspace_id = $1 and id = any($2)', [workspaceId, [...paid.map(o => o.id), delivered!.id]])
    expect(Object.fromEntries(statuses.rows.map(r => [r.id, r.status]))).toEqual({ [paid[0]!.id]: 'processing', [paid[1]!.id]: 'processing', [delivered!.id]: 'delivered' })
    const log = await admin.query<{ entity_id: string; actor_user_id: string; details: { number: number; from: string; to: string; bulk: boolean } }>(
      "select entity_id, actor_user_id, details from fa.activity_log where workspace_id = $1 and action = 'order.status_changed' order by entity_id", [workspaceId])
    expect(log.rows).toHaveLength(2)
    for (const row of log.rows) {
      const order = paid.find(o => o.id === row.entity_id)!
      expect(row).toEqual({ entity_id: order.id, actor_user_id: users.manager, details: { number: order.number, from: 'paid', to: 'processing', bulk: true } })
    }
  })

  it('changes only its own workspace, though every sandbox holds the template ids, and skips unknown ids silently', async () => {
    const mine = await sandbox()
    const theirs = await sandbox()
    const [order] = await ordersWith(theirs.workspaceId, 'paid', 1)
    // Sandboxes copy the template with its ids (spec §6.1): the same id names one order in each workspace.
    const outcome = await changeStatuses(actor(mine.workspaceId, mine.users.owner!, 'owner'), [order!.id, randomUUID()], 'processing', app)
    expect(outcome).toEqual({ changed: [order!.number], skipped: [] })
    const rows = await admin.query<{ workspace_id: string; status: string }>(
      'select workspace_id, status from fa.orders where id = $1 and workspace_id = any($2)', [order!.id, [mine.workspaceId, theirs.workspaceId]])
    expect(Object.fromEntries(rows.rows.map(r => [r.workspace_id, r.status]))).toEqual({ [mine.workspaceId]: 'processing', [theirs.workspaceId]: 'paid' })
  })

  it('changes nothing for a viewer, even when called directly', async () => {
    const { workspaceId, users } = await sandbox()
    const [order] = await ordersWith(workspaceId, 'paid', 1)
    expect(await changeStatuses(actor(workspaceId, users.viewer!, 'viewer'), [order!.id], 'processing', app)).toEqual({ changed: [], skipped: [] })
    const row = await admin.query<{ status: string }>('select status from fa.orders where workspace_id = $1 and id = $2', [workspaceId, order!.id])
    expect(row.rows[0]!.status).toBe('paid')
  })
})
