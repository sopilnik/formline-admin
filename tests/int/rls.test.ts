import { sql } from 'drizzle-orm'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withWorkspace, type Role, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appDirectPool, appPool, closeAll } from './db'
import { asSchemaOwner, createUser, createWorkspace } from './fixtures'

type Actor = Role | 'system'
type Ids = Record<string, string>
type Seeded = { ws: string; users: Record<Role, string>; ids: Ids }

let admin: pg.Pool
let app: pg.Pool
let A: Seeded
let B: Seeded

async function seed(): Promise<Seeded> {
  const ws = await createWorkspace(admin)
  const users = {
    owner: await createUser(admin, ws, 'owner'),
    admin: await createUser(admin, ws, 'admin'),
    manager: await createUser(admin, ws, 'manager'),
    viewer: await createUser(admin, ws, 'viewer'),
  }
  const ids = await asSchemaOwner(admin, async c => {
    const one = async (q: string, p: unknown[]) => (await c.query<{ id: string }>(q, p)).rows[0]!.id
    const out: Ids = {}
    out.collection = await one("insert into fa.collections (workspace_id, slug, name) values ($1, 'primary', 'Primary') returning id", [ws])
    out.emptyCollection = await one("insert into fa.collections (workspace_id, slug, name) values ($1, 'pastel', 'Pastel') returning id", [ws])
    out.image = await one("insert into fa.images (workspace_id, storage_path, source, width, height, bytes) values ($1, 'posters/loud.webp', 'static', 720, 1018, 1000) returning id", [ws])
    out.product = await one("insert into fa.products (workspace_id, slug, name, collection_id, base_price_cents, status) values ($1, 'loud', 'Loud', $2, 2900, 'published') returning id", [ws, out.collection])
    out.variant = await one("insert into fa.product_variants (workspace_id, product_id, sku, size, palette, stock) values ($1, $2, 'loud-a3-signal', 'a3', 'signal', 5) returning id", [ws, out.product])
    out.customer = await one("insert into fa.customers (workspace_id, email, name) values ($1, 'maya@example.test', 'Maya') returning id", [ws])
    await c.query('insert into fa.workspace_counters (workspace_id) values ($1)', [ws])
    out.order = await one("insert into fa.orders (workspace_id, number, customer_id, status, source, delivery, subtotal_cents, shipping_cents, total_cents, placed_at) values ($1, 1001, $2, 'paid', 'seed', 'standard', 2900, 900, 3800, now()) returning id", [ws, out.customer])
    out.line = await one("insert into fa.order_lines (workspace_id, order_id, variant_id, sku, name, unit_cents, qty) values ($1, $2, $3, 'loud-a3-signal', 'Loud · A3 · Signal', 2900, 1) returning id", [ws, out.order, out.variant])
    out.event = await one("insert into fa.order_events (workspace_id, order_id, kind, to_status) values ($1, $2, 'status', 'paid') returning id", [ws, out.order])
    out.activity = await one("insert into fa.activity_log (workspace_id, action) values ($1, 'seed') returning id", [ws])
    out.notification = await one("insert into fa.notifications (workspace_id, kind) values ($1, 'order.new') returning id", [ws])
    out.outbox = await one("insert into fa.outbox_emails (workspace_id, to_address, template) values ($1, 'x@example.test', 'invite') returning id", [ws])
    await c.query('insert into fa.store_settings (workspace_id) values ($1)', [ws])
    out.invitation = await one("insert into fa.invitations (workspace_id, email, role, token_hash, invited_by, expires_at) values ($1, 'i@example.test', 'viewer', md5(random()::text) || md5(random()::text), $2, now() + interval '1 day') returning id", [ws, users.admin])
    for (const role of ['owner', 'admin', 'manager', 'viewer'] as const) {
      await c.query("insert into fa.sessions (workspace_id, id, user_id, expires_at) values ($1, encode(sha256(gen_random_uuid()::text::bytea), 'hex'), $2, now() + interval '1 hour')", [ws, users[role]])
    }
    out.passkey = await one("insert into fa.passkeys (workspace_id, user_id, credential_id, public_key, name) values ($1, $2, replace(gen_random_uuid()::text, '-', ''), 'pk', 'Laptop') returning id", [ws, users.owner])
    out.recovery = await one("insert into fa.recovery_codes (workspace_id, user_id, code_hash) values ($1, $2, encode(sha256(gen_random_uuid()::text::bytea), 'hex')) returning id", [ws, users.owner])
    return out
  })
  return { ws, users, ids }
}

/** The Postgres text of an error: drizzle-orm wraps it and keeps the original on `cause`. */
function errorText(error: unknown): string {
  const parts: string[] = []
  for (let e: unknown = error; e instanceof Error; e = e.cause) parts.push(e.message)
  return parts.length > 0 ? parts.join(' | ') : String(error)
}

/** Runs fn inside withWorkspace and always rolls back, returning fn's outcome. */
async function probe(ctx: WorkspaceContext, fn: Parameters<typeof withWorkspace>[1]): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  class Undo extends Error {
    value: unknown
    constructor(value: unknown) {
      super('undo')
      this.value = value
    }
  }
  try {
    await withWorkspace(ctx, async tx => { throw new Undo(await fn(tx)) }, app)
    throw new Error('unreachable')
  } catch (error) {
    if (error instanceof Undo) return { ok: true, value: error.value }
    return { ok: false, message: errorText(error) }
  }
}

const ctx = (s: Seeded, actor: Actor): WorkspaceContext => ({
  workspaceId: s.ws,
  userId: actor === 'system' ? null : s.users[actor],
  role: actor,
})

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  A = await seed()
  B = await seed()
})
afterAll(closeAll)

const ACTORS: Actor[] = ['owner', 'admin', 'manager', 'viewer', 'system']
const everyTable = ['users', 'sessions', 'passkeys', 'recovery_codes', 'invitations', 'collections', 'images', 'products',
  'product_variants', 'customers', 'workspace_counters', 'orders', 'order_lines', 'order_events', 'activity_log',
  'notifications', 'notification_reads', 'outbox_emails', 'store_settings']

describe('isolation', () => {
  it.each(everyTable)('%s: no actor ever sees another workspace, even without a filter', async table => {
    for (const actor of ACTORS) {
      const r = await probe(ctx(A, actor), tx => tx.execute(sql`select count(*)::int as n from ${sql.identifier('fa')}.${sql.identifier(table)} where workspace_id = ${B.ws}`))
      expect(r).toMatchObject({ ok: true })
      expect((r as { value: { rows: { n: number }[] } }).value.rows[0]?.n).toBe(0)
    }
  })

  it('a query outside withWorkspace sees nothing, also on a reused connection', async () => {
    const direct = appDirectPool()
    await withWorkspace(ctx(A, 'owner'), async tx => tx.execute(sql`select 1`), direct)
    const { rows } = await direct.query<{ w: string | null; n: number }>('select fa.app_workspace() as w, (select count(*)::int from fa.orders) as n')
    expect(rows[0]).toEqual({ w: null, n: 0 })
  })

  it('cannot write into another workspace', async () => {
    const r = await probe(ctx(A, 'owner'), tx => tx.execute(sql`insert into fa.collections (workspace_id, slug, name) values (${B.ws}, 'sneaky', 'Sneaky')`))
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/row-level security/) })
  })
})

// Expected write rights per table and actor — spec §6.2.
type Rights = { insert: Actor[]; update: Actor[]; delete: Actor[] }
const MANAGERS: Actor[] = ['owner', 'admin', 'manager']
const business: Record<string, { rights: Rights; insert: (s: Seeded) => ReturnType<typeof sql>; update: (s: Seeded) => ReturnType<typeof sql>; del: (s: Seeded) => ReturnType<typeof sql> }> = {
  collections: {
    rights: { insert: MANAGERS, update: MANAGERS, delete: MANAGERS },
    insert: s => sql`insert into fa.collections (workspace_id, slug, name) values (${s.ws}, 'night', 'Night')`,
    update: s => sql`update fa.collections set name = name where id = ${s.ids.collection}`,
    del: s => sql`delete from fa.collections where id = ${s.ids.emptyCollection}`,
  },
  images: {
    rights: { insert: MANAGERS, update: MANAGERS, delete: MANAGERS },
    insert: s => sql`insert into fa.images (workspace_id, storage_path, source, width, height, bytes) values (${s.ws}, 'x.webp', 'upload', 1, 1, 1)`,
    update: s => sql`update fa.images set bytes = bytes where id = ${s.ids.image}`,
    del: s => sql`delete from fa.images where id = ${s.ids.image}`,
  },
  products: {
    rights: { insert: MANAGERS, update: MANAGERS, delete: MANAGERS },
    insert: s => sql`insert into fa.products (workspace_id, slug, name, collection_id, base_price_cents, status) values (${s.ws}, 'new', 'New', ${s.ids.collection}, 100, 'draft')`,
    update: s => sql`update fa.products set name = name where id = ${s.ids.product}`,
    del: s => sql`delete from fa.products where id = ${s.ids.product}`,
  },
  product_variants: {
    rights: { insert: MANAGERS, update: [...MANAGERS, 'system'], delete: MANAGERS },
    insert: s => sql`insert into fa.product_variants (workspace_id, product_id, sku, size, palette) values (${s.ws}, ${s.ids.product}, 'loud-a1-ink', 'a1', 'ink')`,
    update: s => sql`update fa.product_variants set stock = stock where id = ${s.ids.variant}`,
    del: s => sql`delete from fa.product_variants where id = ${s.ids.variant}`,
  },
  customers: {
    rights: { insert: ['system'], update: [...MANAGERS, 'system'], delete: [] },
    insert: s => sql`insert into fa.customers (workspace_id, email, name) values (${s.ws}, 'new@example.test', 'New')`,
    update: s => sql`update fa.customers set notes = notes where id = ${s.ids.customer}`,
    del: s => sql`delete from fa.customers where id = ${s.ids.customer}`,
  },
  workspace_counters: {
    rights: { insert: [], update: ['system'], delete: [] },
    insert: s => sql`insert into fa.workspace_counters (workspace_id) values (${s.ws}) on conflict do nothing`,
    update: s => sql`update fa.workspace_counters set next_order_number = next_order_number where workspace_id = ${s.ws}`,
    del: s => sql`delete from fa.workspace_counters where workspace_id = ${s.ws}`,
  },
  orders: {
    rights: { insert: ['system'], update: [...MANAGERS, 'system'], delete: [] },
    insert: s => sql`insert into fa.orders (workspace_id, number, customer_id, status, source, delivery, subtotal_cents, shipping_cents, total_cents, placed_at) values (${s.ws}, 9001, ${s.ids.customer}, 'paid', 'stripe', 'standard', 100, 0, 100, now())`,
    update: s => sql`update fa.orders set status = status where id = ${s.ids.order}`,
    del: s => sql`delete from fa.orders where id = ${s.ids.order}`,
  },
  order_lines: {
    rights: { insert: ['system'], update: [...MANAGERS, 'system'], delete: [] },
    insert: s => sql`insert into fa.order_lines (workspace_id, order_id, name, unit_cents, qty) values (${s.ws}, ${s.ids.order}, 'Line', 100, 1)`,
    update: s => sql`update fa.order_lines set qty = qty where id = ${s.ids.line}`,
    del: s => sql`delete from fa.order_lines where id = ${s.ids.line}`,
  },
  store_settings: {
    rights: { insert: [], update: ['owner', 'admin'], delete: [] },
    insert: s => sql`insert into fa.store_settings (workspace_id) values (${s.ws}) on conflict do nothing`,
    update: s => sql`update fa.store_settings set store_name = store_name where workspace_id = ${s.ws}`,
    del: s => sql`delete from fa.store_settings where workspace_id = ${s.ws}`,
  },
  invitations: {
    rights: { insert: ['owner', 'admin'], update: ['owner', 'admin'], delete: [] },
    insert: s => sql`insert into fa.invitations (workspace_id, email, role, token_hash, invited_by, expires_at) values (${s.ws}, 'j@example.test', 'viewer', ${'d'.repeat(64)}, ${s.users.admin}, now() + interval '1 day')`,
    update: s => sql`update fa.invitations set revoked_at = now() where id = ${s.ids.invitation}`,
    del: s => sql`delete from fa.invitations where id = ${s.ids.invitation}`,
  },
}

/** An insert either succeeds or fails on row-level security; an update or delete changes one row or none. */
async function attempt(s: Seeded, actor: Actor, statement: ReturnType<typeof sql>, op: 'insert' | 'update' | 'delete'): Promise<boolean> {
  const r = await probe(ctx(s, actor), tx => tx.execute(statement))
  if (!r.ok) {
    expect(r.message).toMatch(/row-level security|permission denied/)
    return false
  }
  const rowCount = (r.value as { rowCount: number | null }).rowCount ?? 0
  return op === 'insert' ? true : rowCount === 1
}

describe('write rights follow the matrix', () => {
  for (const [table, spec] of Object.entries(business)) {
    for (const op of ['insert', 'update', 'delete'] as const) {
      it(`${table}: ${op}`, async () => {
        for (const actor of ACTORS) {
          const statement = op === 'insert' ? spec.insert(A) : op === 'update' ? spec.update(A) : spec.del(A)
          expect([table, op, actor, await attempt(A, actor, statement, op)]).toEqual([table, op, actor, spec.rights[op].includes(actor)])
        }
      })
    }
  }

  it('the activity log and order events are append-only for the application', async () => {
    for (const statement of [sql`update fa.activity_log set action = action`, sql`delete from fa.activity_log`, sql`update fa.order_events set note = note`, sql`delete from fa.order_events`]) {
      const r = await probe(ctx(A, 'owner'), tx => tx.execute(statement))
      expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/permission denied/) })
    }
    expect(await attempt(A, 'viewer', sql`insert into fa.activity_log (workspace_id, action) values (${A.ws}, 'viewed')`, 'insert')).toBe(true)
    expect(await attempt(A, 'viewer', sql`insert into fa.order_events (workspace_id, order_id, kind, note) values (${A.ws}, ${A.ids.order}, 'note', 'n')`, 'insert')).toBe(false)
  })

  it('self-service rows belong to their user only', async () => {
    const own = await probe(ctx(A, 'viewer'), tx => tx.execute(sql`select count(*)::int as n from fa.sessions`))
    expect((own as { value: { rows: { n: number }[] } }).value.rows[0]?.n).toBe(1)
    expect(await attempt(A, 'viewer', sql`delete from fa.passkeys where id = ${A.ids.passkey}`, 'delete')).toBe(false)
    expect(await attempt(A, 'owner', sql`delete from fa.passkeys where id = ${A.ids.passkey}`, 'delete')).toBe(true)
    expect(await attempt(A, 'admin', sql`delete from fa.sessions where user_id = ${A.users.viewer}`, 'delete')).toBe(false)
    expect(await attempt(A, 'viewer', sql`delete from fa.sessions where user_id = ${A.users.viewer}`, 'delete')).toBe(true)
    expect(await attempt(A, 'viewer', sql`update fa.users set name = 'Me' where id = ${A.users.viewer}`, 'update')).toBe(true)
    expect(await attempt(A, 'viewer', sql`update fa.users set name = 'You' where id = ${A.users.manager}`, 'update')).toBe(false)
  })

  it("deactivating a user revokes that user's sessions and nobody else's", async () => {
    const C = await seed()
    await withWorkspace(ctx(C, 'admin'), tx => tx.execute(sql`update fa.users set deactivated_at = now() where id = ${C.users.viewer}`), app)
    const { rows } = await admin.query<{ role: string; n: number }>(
      'select u.role::text as role, count(s.id)::int as n from fa.users u left join fa.sessions s on s.workspace_id = u.workspace_id and s.user_id = u.id where u.workspace_id = $1 group by u.role order by 1',
      [C.ws])
    expect(Object.fromEntries(rows.map(r => [r.role, r.n]))).toEqual({ admin: 1, manager: 1, owner: 1, viewer: 0 })
  })

  it('notifications show broadcast and own items only; outbox and activity are for owners and admins', async () => {
    const count = async (actor: Actor, table: string) => {
      const r = await probe(ctx(A, actor), tx => tx.execute(sql`select count(*)::int as n from ${sql.identifier('fa')}.${sql.identifier(table)}`))
      return (r as { value: { rows: { n: number }[] } }).value.rows[0]?.n
    }
    expect(await count('viewer', 'notifications')).toBe(1)
    expect(await count('viewer', 'outbox_emails')).toBe(0)
    expect(await count('admin', 'outbox_emails')).toBe(1)
    expect(await count('manager', 'activity_log')).toBe(0)
    expect(await count('owner', 'activity_log')).toBe(1)
  })
})

describe('functions', () => {
  it('the application may execute exactly the helper functions', async () => {
    const { rows } = await admin.query<{ name: string }>(
      "select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'fa' and has_function_privilege('app', p.oid, 'execute') order by 1")
    expect(rows.map(r => r.name)).toEqual(['app_role', 'app_user', 'app_workspace', 'app_workspace_kind', 'auth_session', 'create_owner', 'owner_workspace_id'])
  })

  it('app_workspace_kind reports the current workspace only', async () => {
    const r = await probe(ctx(A, 'viewer'), tx => tx.execute(sql`select fa.app_workspace_kind() as k`))
    expect((r as { value: { rows: { k: string }[] } }).value.rows[0]?.k).toBe('sandbox')
  })
})
