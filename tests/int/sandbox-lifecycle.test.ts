import { createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateSessionToken, workspaceContext, type Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { withWorkspace } from '@/server/db/with-workspace'
import { endSandbox, resetSandbox } from '@/server/sandbox/lifecycle'
import { adminPool, appPool, closeAll } from './db'
import { asSchemaOwner } from './fixtures'

/** The Postgres text of an error: drizzle-orm wraps it and keeps the original on `cause`. */
function errorText(error: unknown): string {
  const parts: string[] = []
  for (let e: unknown = error; e instanceof Error; e = e.cause) parts.push(e.message)
  return parts.length > 0 ? parts.join(' | ') : String(error)
}

let admin: pg.Pool
let app: pg.Pool
let ownerWorkspace: string

const ipHash = () => createHash('sha256').update(randomUUID()).digest('hex')
const meta = { userAgentSummary: 'Vitest', locale: 'en' as const }

async function enter(ip = ipHash()): Promise<{ session: Session; token: string }> {
  const token = generateToken()
  const { rows } = await app.query<{ outcome: string }>('select outcome from fa.create_sandbox($1, $2, $3, $4)', [ip, hashToken(token), 'Vitest', 'en'])
  expect(rows[0]?.outcome).toBe('created')
  const session = await validateSessionToken(token, app)
  return { session: session!, token }
}

async function count(table: string, workspaceId: string): Promise<number> {
  const { rows } = await admin.query<{ n: string }>(`select count(*) as n from fa.${table} where workspace_id = $1`, [workspaceId])
  return Number(rows[0]!.n)
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  ownerWorkspace = (await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
})
afterAll(closeAll)

describe('end_sandbox', () => {
  it('removes everything of its own sandbox, queues its uploads and leaves other sandboxes alone', async () => {
    const a = await enter()
    const b = await enter()
    await asSchemaOwner(admin, c => c.query(
      "insert into fa.images (workspace_id, storage_path, source, width, height, bytes) values ($1, 'media/a-upload.webp', 'upload', 10, 10, 100)", [a.session.workspaceId]))
    try {
      expect(await endSandbox(a.session, app)).toBe(1)
      expect((await admin.query('select 1 from fa.workspaces where id = $1', [a.session.workspaceId])).rowCount).toBe(0)
      for (const table of ['users', 'sessions', 'images', 'customers', 'orders', 'order_lines', 'order_events', 'activity_log', 'store_settings']) {
        expect(await count(table, a.session.workspaceId), table).toBe(0)
      }
      expect(await validateSessionToken(a.token, app)).toBeNull()
      expect(await validateSessionToken(b.token, app)).not.toBeNull()
      expect(await count('orders', b.session.workspaceId)).toBeGreaterThan(0)
      const queued = await admin.query('select 1 from fa.pending_media_deletions where storage_path = $1', ['media/a-upload.webp'])
      expect(queued.rowCount).toBe(1)
      const posters = await admin.query("select 1 from fa.pending_media_deletions where storage_path like 'posters/%'")
      expect(posters.rowCount).toBe(0)
    } finally {
      await admin.query('delete from fa.pending_media_deletions where storage_path = $1', ['media/a-upload.webp'])
      await endSandbox(b.session, app)
    }
  })

  it('refuses outside a sandbox', async () => {
    await withWorkspace({ workspaceId: ownerWorkspace, userId: null, role: 'system' }, tx => tx.execute(sql`select fa.end_sandbox()`), app)
      .then(() => { throw new Error('expected end_sandbox to refuse') }, error => expect(errorText(error)).toMatch(/not inside a sandbox/))
  })
})

describe('reset_sandbox', () => {
  it('replaces the sandbox with a fresh copy and counts against the address limit', async () => {
    const ip = ipHash()
    const a = await enter(ip)
    await withWorkspace(workspaceContext(a.session), tx => tx.execute(sql`update fa.collections set name = 'Changed' where slug = 'night'`), app)
    const result = await resetSandbox(a.session, { ipHash: ip, ...meta }, app)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    try {
      expect(result.workspaceId).not.toBe(a.session.workspaceId)
      expect((await admin.query('select 1 from fa.workspaces where id = $1', [a.session.workspaceId])).rowCount).toBe(0)
      const night = await admin.query<{ name: string }>("select name from fa.collections where workspace_id = $1 and slug = 'night'", [result.workspaceId])
      expect(night.rows[0]?.name).toBe('Night')
      expect(await validateSessionToken(a.token, app)).toBeNull()
      expect(await validateSessionToken(result.token, app)).toMatchObject({ workspaceId: result.workspaceId, role: 'owner' })
      const limit = await admin.query<{ count: number }>("select count from fa.rate_limits where purpose = 'sandbox.create.ip' and subject = $1", [`ip:${ip}`])
      expect(limit.rows[0]?.count).toBe(2)
    } finally {
      await admin.query('delete from fa.workspaces where id = $1', [result.workspaceId])
    }
  })

  it('keeps the sandbox when the address limit refuses the new copy', async () => {
    const ip = ipHash()
    const a = await enter(ip)
    for (let i = 0; i < 4; i++) await enter(ip)
    const result = await resetSandbox(a.session, { ipHash: ip, ...meta }, app)
    expect(result).toMatchObject({ ok: false, error: 'demo_rate_limited' })
    const kept = await admin.query<{ live: boolean }>('select expires_at > now() as live from fa.workspaces where id = $1', [a.session.workspaceId])
    expect(kept.rows[0]?.live).toBe(true)
    expect(await validateSessionToken(a.token, app)).not.toBeNull()
  })
})
