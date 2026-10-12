import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSession, rotateSession, validateSessionToken } from '@/server/auth/sessions'
import { generateToken } from '@/server/auth/tokens'
import { deleteOtherOwnSessions } from '@/server/dal/sessions'
import { withWorkspace } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { asSchemaOwner, createUser, createWorkspace } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let sandbox: string
let member: string

const meta = { userAgentSummary: 'Chrome, Linux', ipHash: null }

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  sandbox = await createWorkspace(admin)
  member = await createUser(admin, sandbox, 'admin')
})
afterAll(closeAll)

function newSession(workspaceId: string, userId: string, verified = true) {
  return withWorkspace({ workspaceId, userId, role: 'system' }, tx => createSession(tx, { workspaceId, userId, verified, ...meta }), app)
}

describe('the owner workspace', () => {
  it('exists once after the migrations and is what owner_workspace_id() returns', async () => {
    const { rows } = await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")
    expect(rows).toHaveLength(1)
    const found = await app.query<{ id: string }>('select fa.owner_workspace_id() as id')
    expect(found.rows[0]?.id).toBe(rows[0]!.id)
  })
})

describe('auth_session', () => {
  it('resolves a verified session with the live role of its user', async () => {
    const { token } = await newSession(sandbox, member)
    const session = await validateSessionToken(token, app)
    expect(session).toMatchObject({ workspaceId: sandbox, workspaceKind: 'sandbox', userId: member, role: 'admin', secondFactorVerified: true })
    expect(session?.reauthAt).toBeInstanceOf(Date)
    await asSchemaOwner(admin, c => c.query("update fa.users set role = 'viewer' where id = $1", [member]))
    expect((await validateSessionToken(token, app))?.role).toBe('viewer')
    await asSchemaOwner(admin, c => c.query("update fa.users set role = 'admin' where id = $1", [member]))
  })

  it('gives a pending session ten minutes and no verified factor', async () => {
    const { token } = await newSession(sandbox, member, false)
    const session = await validateSessionToken(token, app)
    expect(session?.secondFactorVerified).toBe(false)
    expect(session?.reauthAt).toBeNull()
    const minutes = (session!.expiresAt.getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(9)
    expect(minutes).toBeLessThanOrEqual(10)
  })

  it('ends at the absolute expiry', async () => {
    const { token, id } = await newSession(sandbox, member)
    await admin.query("update fa.sessions set expires_at = now() - interval '1 second' where id = $1", [id])
    expect(await validateSessionToken(token, app)).toBeNull()
  })

  it('ends an owner-workspace session after 12 idle hours', async () => {
    const ownerWorkspace = (await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
    // A non-owner row stands in, so that only the setup tests ever create the owner.
    const user = await createUser(admin, ownerWorkspace, 'admin')
    try {
      const { token, id } = await newSession(ownerWorkspace, user)
      expect(await validateSessionToken(token, app)).not.toBeNull()
      await admin.query("update fa.sessions set last_seen_at = now() - interval '12 hours 1 minute' where id = $1", [id])
      expect(await validateSessionToken(token, app)).toBeNull()
    } finally {
      await admin.query('delete from fa.users where workspace_id = $1 and id = $2', [ownerWorkspace, user])
    }
  })

  it('ends a sandbox session when the sandbox expires or has been idle for two hours', async () => {
    const ws = await createWorkspace(admin)
    const user = await createUser(admin, ws, 'owner')
    const { token } = await newSession(ws, user)
    await admin.query("update fa.workspaces set last_active_at = now() - interval '2 hours 1 minute' where id = $1", [ws])
    expect(await validateSessionToken(token, app)).toBeNull()
    await admin.query("update fa.workspaces set last_active_at = now(), expires_at = now() - interval '1 second' where id = $1", [ws])
    expect(await validateSessionToken(token, app)).toBeNull()
    await admin.query("update fa.workspaces set expires_at = now() + interval '1 hour' where id = $1", [ws])
    expect(await validateSessionToken(token, app)).not.toBeNull()
  })

  it('ends when the user is deactivated', async () => {
    const user = await createUser(admin, sandbox, 'manager')
    const { token } = await newSession(sandbox, user)
    await asSchemaOwner(admin, c => c.query('update fa.users set deactivated_at = now() where id = $1', [user]))
    expect(await validateSessionToken(token, app)).toBeNull()
  })

  it('touches last_seen_at and the workspace at most once a minute', async () => {
    const { token, id } = await newSession(sandbox, member)
    const seen = async () => (await admin.query<{ s: Date; w: Date }>(
      'select s.last_seen_at as s, w.last_active_at as w from fa.sessions s join fa.workspaces w on w.id = s.workspace_id where s.id = $1', [id])).rows[0]!
    await admin.query("update fa.sessions set last_seen_at = now() - interval '2 minutes' where id = $1", [id])
    await admin.query("update fa.workspaces set last_active_at = now() - interval '2 minutes' where id = $1", [sandbox])
    await validateSessionToken(token, app)
    const first = await seen()
    expect(Date.now() - first.s.getTime()).toBeLessThan(10_000)
    expect(Date.now() - first.w.getTime()).toBeLessThan(10_000)
    await validateSessionToken(token, app)
    expect((await seen()).s.getTime()).toBe(first.s.getTime())
  })

  it('resolves a malformed or unknown token to nothing', async () => {
    expect(await validateSessionToken('not a token', app)).toBeNull()
    expect(await validateSessionToken(generateToken(), app)).toBeNull()
  })
})

describe('session changes', () => {
  it('rotation issues a fresh verified token and retires the old one', async () => {
    const pending = await newSession(sandbox, member, false)
    const session = (await validateSessionToken(pending.token, app))!
    const fresh = await withWorkspace({ workspaceId: sandbox, userId: member, role: 'admin' }, tx => rotateSession(tx, session, meta), app)
    expect(fresh.token).not.toBe(pending.token)
    expect(await validateSessionToken(pending.token, app)).toBeNull()
    const rotated = await validateSessionToken(fresh.token, app)
    expect(rotated?.secondFactorVerified).toBe(true)
    expect(rotated?.reauthAt).toBeInstanceOf(Date)
  })

  it("signing out other sessions keeps the current one and other users' sessions", async () => {
    const other = await createUser(admin, sandbox, 'viewer')
    const a = await newSession(sandbox, member)
    const b = await newSession(sandbox, member)
    const c = await newSession(sandbox, other)
    const current = (await validateSessionToken(a.token, app))!
    await withWorkspace({ workspaceId: sandbox, userId: member, role: 'admin' }, tx => deleteOtherOwnSessions(tx, current), app)
    expect(await validateSessionToken(a.token, app)).not.toBeNull()
    expect(await validateSessionToken(b.token, app)).toBeNull()
    expect(await validateSessionToken(c.token, app)).not.toBeNull()
  })
})
