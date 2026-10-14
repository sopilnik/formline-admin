import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { securityNotice } from '@/server/auth/notices'
import { createSession, rotateSession, type CreatedSession, type Session } from '@/server/auth/sessions'
import {
  countUnread, listNotifications, markAllNotificationsRead, markNotificationRead, notificationHref, notify, type NotificationReader,
} from '@/server/dal/notifications'
import { sessionSignInId } from '@/server/dal/sessions'
import { getSelf } from '@/server/dal/users'
import { withWorkspace, type Role, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, memberIds } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
// Two sandboxes for the whole file.
let box: Sandbox
let other: Sandbox

type Sandbox = { workspaceId: string; users: Record<Role, string> }

async function sandbox(): Promise<Sandbox> {
  const { workspaceId } = await createSandbox(app)
  return { workspaceId, users: await memberIds(admin, workspaceId) }
}

const ctx = (box: Sandbox, role: Role): WorkspaceContext => ({ workspaceId: box.workspaceId, userId: box.users[role], role })
const reader = (box: Sandbox, role: Role, signInId: string | null = null): NotificationReader => ({ workspaceId: box.workspaceId, userId: box.users[role], signInId })
const unread = (box: Sandbox, role: Role, signInId: string | null = null) => withWorkspace(ctx(box, role), tx => countUnread(tx, reader(box, role, signInId)), app)

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  box = await sandbox()
  other = await sandbox()
})
afterAll(closeAll)

describe('a new sandbox', () => {
  it('starts with "New order" for its five latest orders and "Low stock" for three variants at their threshold, for everybody', async () => {
    const { rows } = await admin.query<{ user_id: string | null; kind: string; payload: Record<string, unknown>; created_at: Date }>(
      'select user_id, kind, payload, created_at from fa.notifications where workspace_id = $1 order by created_at desc', [box.workspaceId])
    expect(rows).toHaveLength(8)
    expect(rows.every(r => r.user_id === null)).toBe(true)
    const latest = await admin.query<{ number: number; name: string; total_cents: number; placed_at: Date }>(
      `select o.number, c.name, o.total_cents, o.placed_at from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id
        where o.workspace_id = $1 order by o.placed_at desc, o.id desc limit 5`, [box.workspaceId])
    const orders = rows.filter(r => r.kind === 'order.created')
    expect(orders.map(r => r.payload.number)).toEqual(latest.rows.map(o => o.number))
    expect(orders[0]!.payload).toMatchObject({ customer: latest.rows[0]!.name, totalCents: latest.rows[0]!.total_cents })
    expect(orders[0]!.created_at).toEqual(latest.rows[0]!.placed_at)
    const low = await admin.query<{ product_id: string; name: string; size: string; palette: string; stock: number; low_stock_threshold: number }>(
      `select v.product_id, p.name, v.size, v.palette, v.stock, v.low_stock_threshold
         from fa.product_variants v join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id
        where v.workspace_id = $1 and p.status = 'published' and v.stock between 1 and v.low_stock_threshold
        order by v.stock, p.name collate "unicode", v.size, v.palette limit 3`, [box.workspaceId])
    const stock = rows.filter(r => r.kind === 'stock.low')
    expect(stock.map(r => r.payload)).toEqual(low.rows.map(v => ({
      productId: v.product_id, product: v.name, size: v.size, palette: v.palette, stock: v.stock, threshold: v.low_stock_threshold,
    })))
    for (const row of stock) expect(row.created_at.getTime()).toBeLessThan(latest.rows[0]!.placed_at.getTime())
    for (const row of rows) expect(row.created_at.getTime()).toBeLessThanOrEqual(Date.now())
    for (const role of ['owner', 'admin', 'manager', 'viewer'] as const) expect(await unread(box, role)).toBe(8)
  })
})

describe('the notifications of a member', () => {
  it('come newest first with their read marks, a page at a time', async () => {
    const first = await withWorkspace(ctx(box, 'admin'), tx => listNotifications(tx, reader(box, 'admin'), { page: 1, size: 3 }), app)
    expect(first).toMatchObject({ total: 8, unread: 8, pages: 3 })
    expect(first.rows).toHaveLength(3)
    expect(first.rows[0]).toMatchObject({ kind: 'order.created', read: false, thisDevice: false })
    const last = await withWorkspace(ctx(box, 'admin'), tx => listNotifications(tx, reader(box, 'admin'), { page: 3, size: 3 }), app)
    expect(last.rows).toHaveLength(2)
    const all = [...first.rows, ...last.rows]
    for (let i = 1; i < all.length; i++) expect(all[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(all[i]!.createdAt.getTime())
  })

  it('are marked read one at a time for that member only, harmlessly twice, and never across members or workspaces', async () => {
    const { rows } = await withWorkspace(ctx(box, 'owner'), tx => listNotifications(tx, reader(box, 'owner'), { page: 1, size: 25 }), app)
    const id = rows[0]!.id
    const opened = await withWorkspace(ctx(box, 'owner'), tx => markNotificationRead(tx, reader(box, 'owner'), id), app)
    expect(opened).toEqual({ kind: rows[0]!.kind, payload: rows[0]!.payload })
    await withWorkspace(ctx(box, 'owner'), tx => markNotificationRead(tx, reader(box, 'owner'), id), app)
    expect(await unread(box, 'owner')).toBe(7)
    expect(await unread(box, 'admin')).toBe(8)
    const listed = await withWorkspace(ctx(box, 'owner'), tx => listNotifications(tx, reader(box, 'owner'), { page: 1, size: 25 }), app)
    expect(listed.rows.find(r => r.id === id)?.read).toBe(true)
    expect(listed.unread).toBe(7)
    expect(await withWorkspace(ctx(box, 'owner'), tx => markNotificationRead(tx, reader(box, 'owner'), randomUUID()), app)).toBeNull()
    // The other sandbox has its own copy; its owner marking an id of this one changes nothing here.
    const foreign = await withWorkspace(ctx(other, 'owner'), tx => markNotificationRead(tx, reader(other, 'owner'), id), app)
    expect(foreign).toBeNull()
    expect(await unread(other, 'owner')).toBe(8)
  })

  it('are marked read all at once for that member only', async () => {
    expect(await withWorkspace(ctx(box, 'manager'), tx => markAllNotificationsRead(tx, reader(box, 'manager')), app)).toBe(8)
    expect(await withWorkspace(ctx(box, 'manager'), tx => markAllNotificationsRead(tx, reader(box, 'manager')), app)).toBe(0)
    expect(await unread(box, 'manager')).toBe(0)
    expect(await unread(box, 'viewer')).toBe(8)
  })

  it('include the ones addressed to them and never the ones addressed to somebody else', async () => {
    const owner = await unread(box, 'owner')
    await withWorkspace(ctx(box, 'admin'), tx => notify(tx, box.workspaceId, { userId: box.users.admin, kind: 'auth.recovery_code_used', payload: { remaining: 9 } }), app)
    expect(await unread(box, 'admin')).toBe(9)
    expect(await unread(box, 'owner')).toBe(owner)
    const [addressed] = (await admin.query<{ id: string }>("select id from fa.notifications where workspace_id = $1 and kind = 'auth.recovery_code_used'", [box.workspaceId])).rows
    const listed = await withWorkspace(ctx(box, 'owner'), tx => listNotifications(tx, reader(box, 'owner'), { page: 1, size: 25 }), app)
    expect(listed.rows.map(r => r.id)).not.toContain(addressed!.id)
    expect(await withWorkspace(ctx(box, 'owner'), tx => markNotificationRead(tx, reader(box, 'owner'), addressed!.id), app)).toBeNull()
  })
})

describe('a new sign-in', () => {
  const meta = { userAgentSummary: 'Firefox, Linux', ipHash: null }

  async function signIn(where: Sandbox): Promise<CreatedSession> {
    return withWorkspace(ctx(where, 'owner'), tx => createSession(tx, { workspaceId: where.workspaceId, userId: where.users.owner, verified: true, ...meta }), app)
  }

  // The other sandbox from here on: its members have not read anything yet.
  it('is not counted on the device that signed in, and is on every other one', async () => {
    const here = await signIn(other)
    const there = await signIn(other)
    expect(here.signInId).not.toBe(there.signInId)
    await withWorkspace(ctx(other, 'owner'), async tx => {
      const self = (await getSelf(tx, { workspaceId: other.workspaceId, userId: other.users.owner }))!
      await securityNotice(tx, other.workspaceId, self, 'auth.new_sign_in', { device: 'Firefox, Linux' }, { at: new Date(), signInId: here.signInId })
    }, app)
    const { rows } = await admin.query<{ payload: Record<string, unknown> }>(
      "select payload from fa.outbox_emails where workspace_id = $1 and template = 'auth.new_sign_in'", [other.workspaceId])
    expect(rows[0]!.payload).not.toHaveProperty('signIn')
    expect(await unread(other, 'owner', here.signInId)).toBe(8)
    expect(await unread(other, 'owner', there.signInId)).toBe(9)
    const own = await withWorkspace(ctx(other, 'owner'), tx => listNotifications(tx, reader(other, 'owner', here.signInId), { page: 1, size: 25 }), app)
    expect(own.unread).toBe(8)
    expect(own.rows.find(r => r.kind === 'auth.new_sign_in')).toMatchObject({ read: false, thisDevice: true })
    const elsewhere = await withWorkspace(ctx(other, 'owner'), tx => listNotifications(tx, reader(other, 'owner', there.signInId), { page: 1, size: 25 }), app)
    expect(elsewhere.rows.find(r => r.kind === 'auth.new_sign_in')).toMatchObject({ read: false, thisDevice: false })
  })

  it('keeps its sign-in and its sign-in time through a rotation of the session', async () => {
    const first = await signIn(other)
    // Signed in an hour ago: a re-authentication now does not make the device's sign-in newer.
    await admin.query("update fa.sessions set created_at = now() - interval '1 hour' where id = $1", [first.id])
    const signedIn = (await admin.query<{ created_at: Date }>('select created_at from fa.sessions where id = $1', [first.id])).rows[0]!.created_at
    const session: Session = {
      id: first.id, workspaceId: other.workspaceId, workspaceKind: 'sandbox', userId: other.users.owner, role: 'owner',
      secondFactorVerified: true, reauthAt: new Date(), expiresAt: first.expiresAt,
    }
    const rotated = (await withWorkspace(ctx(other, 'owner'), tx => rotateSession(tx, session, meta), app))!
    expect(rotated.id).not.toBe(first.id)
    expect(rotated.signInId).toBe(first.signInId)
    expect(await withWorkspace(ctx(other, 'owner'), tx => sessionSignInId(tx, rotated.id), app)).toBe(first.signInId)
    expect(await withWorkspace(ctx(other, 'owner'), tx => sessionSignInId(tx, first.id), app)).toBeNull()
    expect((await admin.query<{ created_at: Date }>('select created_at from fa.sessions where id = $1', [rotated.id])).rows[0]!.created_at).toEqual(signedIn)
  })
})

describe('notificationHref', () => {
  const reader = (role: Role) => ({ workspaceId: other.workspaceId, role, workspaceKind: 'sandbox' as const })

  it('opens the order, the product under its current slug, the team or the security page', async () => {
    const href = (kind: string, payload: unknown) => withWorkspace(ctx(other, 'owner'), tx => notificationHref(tx, reader('owner'), kind, payload), app)
    expect(await href('order.created', { number: 1700 })).toBe('/orders/1700')
    const [product] = (await admin.query<{ id: string; slug: string }>('select id, slug from fa.products where workspace_id = $1 order by slug limit 1', [other.workspaceId])).rows
    expect(await href('stock.low', { productId: product!.id })).toBe(`/products/${product!.slug}`)
    await admin.query("update fa.products set slug = slug || '-renamed' where workspace_id = $1 and id = $2", [other.workspaceId, product!.id])
    expect(await href('stock.low', { productId: product!.id })).toBe(`/products/${product!.slug}-renamed`)
    expect(await href('stock.low', { productId: randomUUID() })).toBe('/products')
    expect(await href('team.invitation_accepted', {})).toBe('/team')
    expect(await href('auth.second_factor_locked', {})).toBe('/settings/security')
    expect(await href('order.new', {})).toBe('/notifications')
  })

  it('leaves a reader on the notifications page when the team page is not theirs to see', async () => {
    const href = await withWorkspace(ctx(other, 'viewer'), tx => notificationHref(tx, reader('viewer'), 'team.invitation_accepted', {}), app)
    expect(href).toBe('/notifications')
  })
})
