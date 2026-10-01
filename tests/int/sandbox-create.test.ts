import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateSessionToken } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { roomInWindow } from '../windows'
import { adminPool, appPool, closeAll } from './db'
import { asSchemaOwner } from './fixtures'

type Entry = { outcome: string; sandbox_id: string | null; demo_user_id: string | null; sandbox_expires_at: Date | null; retry_after_seconds: number }

const TABLES = ['users', 'collections', 'images', 'products', 'product_variants', 'customers', 'workspace_counters', 'orders', 'order_lines', 'order_events', 'store_settings'] as const
const DAY = 86_400_000

let admin: pg.Pool
let app: pg.Pool
let template: string
let owner: string

const ipHash = () => createHash('sha256').update(randomUUID()).digest('hex')

async function create(ip: string | null, locale = 'en'): Promise<Entry & { token: string }> {
  const token = generateToken()
  const { rows } = await app.query<Entry>('select * from fa.create_sandbox($1, $2, $3, $4)', [ip, hashToken(token), 'Vitest', locale])
  return { ...rows[0]!, token }
}

async function counts(workspaceId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const table of TABLES) {
    const { rows } = await admin.query<{ n: string }>(`select count(*) as n from fa.${table} where workspace_id = $1`, [workspaceId])
    out[table] = Number(rows[0]!.n)
  }
  return out
}

async function liveSandboxes(): Promise<number> {
  const { rows } = await admin.query<{ n: string }>(
    "select count(*) as n from fa.workspaces where kind = 'sandbox' and expires_at > now() and last_active_at > now() - interval '2 hours'")
  return Number(rows[0]!.n)
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  const { rows } = await admin.query<{ id: string; kind: string }>("select id, kind from fa.workspaces where kind in ('template', 'owner')")
  template = rows.find(r => r.kind === 'template')!.id
  owner = rows.find(r => r.kind === 'owner')!.id
})
afterAll(closeAll)

describe('create_sandbox', () => {
  it('copies the template with its ids into a new workspace and opens the demo owner session', async () => {
    const entry = await create(ipHash(), 'ru')
    expect(entry.outcome).toBe('created')
    const ws = entry.sandbox_id!
    expect(ws).not.toBe(template)
    expect(await counts(ws)).toEqual(await counts(template))
    const ids = async (table: string, workspaceId: string) =>
      (await admin.query<{ id: string }>(`select id from fa.${table} where workspace_id = $1 order by id`, [workspaceId])).rows.map(r => r.id)
    expect(await ids('products', ws)).toEqual(await ids('products', template))
    expect(await ids('orders', ws)).toEqual(await ids('orders', template))
    const session = await validateSessionToken(entry.token, app)
    expect(session).toMatchObject({ workspaceId: ws, workspaceKind: 'sandbox', userId: entry.demo_user_id, role: 'owner', secondFactorVerified: true })
    const hours = (session!.expiresAt.getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(23.9)
    expect(hours).toBeLessThanOrEqual(24)
    expect(entry.sandbox_expires_at).toEqual(session!.expiresAt)
    const log = await admin.query<{ action: string; actor_user_id: string }>('select action, actor_user_id from fa.activity_log where workspace_id = $1', [ws])
    expect(log.rows).toEqual([{ action: 'sandbox.created', actor_user_id: entry.demo_user_id }])
    const demoOwner = await admin.query<{ locale: string; name: string }>('select locale, name from fa.users where workspace_id = $1 and id = $2', [ws, entry.demo_user_id])
    expect(demoOwner.rows[0]).toEqual({ locale: 'ru', name: 'Dana Ortiz' })
    const workspace = await admin.query<{ creator_ip_hash: string; template_version: number }>('select creator_ip_hash, template_version from fa.workspaces where id = $1', [ws])
    expect(workspace.rows[0]?.creator_ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(workspace.rows[0]?.template_version).toBeGreaterThanOrEqual(1)
  })

  it('shifts generated dates to the present and keeps the dates of store-order copies', async () => {
    const copy = await asSchemaOwner(admin, async c => {
      const customer = await c.query<{ id: string }>(
        "insert into fa.customers (workspace_id, email, name, pseudonymised_at, created_at) values ($1, 'copy2@example.test', 'Store Copy', now(), '2026-03-01T09:00:00Z') returning id", [template])
      const order = await c.query<{ id: string }>(
        "insert into fa.orders (workspace_id, number, customer_id, status, source, stripe_session_id, delivery, subtotal_cents, shipping_cents, total_cents, placed_at, updated_at) values ($1, 6000, $2, 'paid', 'stripe', 'cs_test_copy2', 'standard', 2900, 900, 3800, '2026-03-03T10:00:00Z', '2026-03-03T10:00:00Z') returning id",
        [template, customer.rows[0]!.id])
      await c.query("insert into fa.order_events (workspace_id, order_id, kind, to_status, at) values ($1, $2, 'status', 'paid', '2026-03-03T10:00:00Z')", [template, order.rows[0]!.id])
      return { customer: customer.rows[0]!.id, order: order.rows[0]!.id }
    })
    try {
      const entry = await create(ipHash())
      const ws = entry.sandbox_id!
      const seed = await admin.query<{ newest: Date; oldest: Date }>(
        "select max(placed_at) as newest, min(placed_at) as oldest from fa.orders where workspace_id = $1 and source = 'seed'", [ws])
      expect(Date.now() - seed.rows[0]!.newest.getTime()).toBeLessThan(60 * 60_000)
      expect(seed.rows[0]!.newest.getTime()).toBeLessThanOrEqual(Date.now())
      expect(Date.now() - seed.rows[0]!.oldest.getTime()).toBeLessThan(181 * DAY)
      const kept = await admin.query<{ placed_at: Date; at: Date; created_at: Date }>(
        `select o.placed_at, e.at, c.created_at from fa.orders o
           join fa.order_events e on e.workspace_id = o.workspace_id and e.order_id = o.id
           join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id
          where o.workspace_id = $1 and o.id = $2`, [ws, copy.order])
      expect(kept.rows[0]).toEqual({ placed_at: new Date('2026-03-03T10:00:00Z'), at: new Date('2026-03-03T10:00:00Z'), created_at: new Date('2026-03-01T09:00:00Z') })
      const events = await admin.query<{ n: string }>(
        'select count(*) as n from fa.order_events e where e.workspace_id = $1 and e.at > now()', [ws])
      expect(Number(events.rows[0]!.n)).toBe(0)
    } finally {
      await asSchemaOwner(admin, async c => {
        await c.query('delete from fa.orders where workspace_id = $1 and id = $2', [template, copy.order])
        await c.query('delete from fa.customers where workspace_id = $1 and id = $2', [template, copy.customer])
      })
    }
  })

  it('never reads the owner workspace', async () => {
    await asSchemaOwner(admin, c => c.query("insert into fa.collections (workspace_id, slug, name) values ($1, 'owner-only', 'Owner only')", [owner]))
    try {
      const entry = await create(ipHash())
      const { rowCount } = await admin.query("select 1 from fa.collections where workspace_id = $1 and slug = 'owner-only'", [entry.sandbox_id])
      expect(rowCount).toBe(0)
    } finally {
      await asSchemaOwner(admin, c => c.query("delete from fa.collections where workspace_id = $1 and slug = 'owner-only'", [owner]))
    }
  })

  it('allows five sandboxes an hour per address, then reports the wait', async () => {
    // create_sandbox counts the entries of an address in fixed hours.
    await roomInWindow(60 * 60, 10)
    const ip = ipHash()
    for (let i = 0; i < 5; i++) expect((await create(ip)).outcome).toBe('created')
    const sixth = await create(ip)
    expect(sixth).toMatchObject({ outcome: 'rate_limited', sandbox_id: null, demo_user_id: null, sandbox_expires_at: null })
    expect(sixth.retry_after_seconds).toBeGreaterThanOrEqual(1)
    expect(sixth.retry_after_seconds).toBeLessThanOrEqual(3600)
    expect((await create(ipHash())).outcome).toBe('created')
    const { rows } = await admin.query<{ count: number }>("select count from fa.rate_limits where purpose = 'sandbox.create.ip' and subject = $1", [`ip:${ip}`])
    expect(rows[0]?.count).toBe(6)
  })

  it('holds the cap under concurrent entries and evicts only idle sandboxes', async () => {
    const missing = 100 - await liveSandboxes()
    expect(missing).toBeGreaterThanOrEqual(2)
    const insert = (n: number, idle: string) => admin.query<{ id: string }>(
      `insert into fa.workspaces (kind, expires_at, last_active_at)
       select 'sandbox', now() + interval '1 day', now() - $2::interval from generate_series(1, $1) returning id`, [n, idle])
    const idle = (await insert(2, '16 minutes')).rows.map(r => r.id)
    const active = (await insert(missing - 2, '0 minutes')).rows.map(r => r.id)
    const made: string[] = []
    try {
      const [a, b] = await Promise.all([create(ipHash()), create(ipHash())])
      made.push(...[a.sandbox_id, b.sandbox_id].filter((id): id is string => id !== null))
      expect([a.outcome, b.outcome]).toEqual(['created', 'created'])
      expect((await admin.query('select 1 from fa.workspaces where id = any($1::uuid[])', [idle])).rowCount).toBe(0)
      expect((await admin.query('select 1 from fa.workspaces where id = any($1::uuid[])', [active])).rowCount).toBe(active.length)
      expect(await liveSandboxes()).toBe(100)
      const third = await create(ipHash())
      expect(third).toMatchObject({ outcome: 'full', sandbox_id: null })
      expect(await liveSandboxes()).toBe(100)
    } finally {
      await admin.query('delete from fa.workspaces where id = any($1::uuid[])', [[...idle, ...active, ...made]])
    }
  })
})

describe('the application role', () => {
  it('cannot call the media queue helper directly', async () => {
    await expect(app.query("select fa.queue_workspace_media('00000000-0000-0000-0000-000000000000')")).rejects.toThrow(/permission denied/)
  })
})
