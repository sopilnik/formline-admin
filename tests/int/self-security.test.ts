import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/server/auth/passwords'
import { changeOwnPassword, revokeOtherSessions, revokeOwnSession } from '@/server/auth/self-security'
import type { Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { listOwnSessions } from '@/server/dal/sessions'
import { withWorkspace } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { asSchemaOwner, createSandbox, insertSession } from './fixtures'
import { ensureOwner, noBreach, OWNER } from './owner'

let admin: pg.Pool
let app: pg.Pool
let ownerId: string
let ownerWorkspace: string

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  ownerId = await ensureOwner(admin, app)
  ownerWorkspace = (await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
})
afterAll(async () => {
  // The owner is shared by every auth test file: the password goes back to the one they sign in with.
  const passwordHash = await hashPassword(OWNER.password)
  await asSchemaOwner(admin, c => c.query('update fa.users set password_hash = $2 where workspace_id = $1 and id = $3', [ownerWorkspace, passwordHash, ownerId]))
  await closeAll()
})

/** A verified session row of a user, as a signed-in device would have it. */
const device = (workspaceId: string, userId: string, agent: string, reauthAt: Date | null = new Date()): Promise<Session> =>
  insertSession(admin, workspaceId, userId, { reauthAt, userAgent: agent })

const exists = async (session: Session) => (await admin.query('select 1 from fa.sessions where id = $1', [session.id])).rowCount === 1

const actions = async (workspaceId: string, action: string) => (await admin.query<{ details: Record<string, unknown> }>(
  'select details from fa.activity_log where workspace_id = $1 and action = $2 order by at', [workspaceId, action])).rows.map(r => r.details)

const passwordHashOf = async () => (await admin.query<{ hash: string }>('select password_hash as hash from fa.users where workspace_id = $1 and id = $2', [ownerWorkspace, ownerId])).rows[0]!.hash

describe('changeOwnPassword', () => {
  it('asks for a fresh sign-in and applies the password rules', async () => {
    const stale = await device(ownerWorkspace, ownerId, 'Firefox, Linux', new Date(Date.now() - 3_600_000))
    expect(await changeOwnPassword(stale, { password: 'a-long-new-password-1', ip: null }, { pool: app, isBreached: noBreach })).toEqual({ ok: false, error: 'reauth_required' })
    const fresh = await device(ownerWorkspace, ownerId, 'Firefox, Linux')
    expect(await changeOwnPassword(fresh, { password: 'short', ip: null }, { pool: app, isBreached: noBreach })).toEqual({ ok: false, error: 'password_too_short', field: 'password' })
    expect(await changeOwnPassword(fresh, { password: 'a-long-new-password-1', ip: null }, { pool: app, isBreached: async () => true }))
      .toEqual({ ok: false, error: 'password_breached', field: 'password' })
    expect(await verifyPassword(await passwordHashOf(), OWNER.password)).toBe(true)
  })

  it('stores the new password, signs the other devices out and logs it', async () => {
    const current = await device(ownerWorkspace, ownerId, 'Chrome, macOS')
    const other = await device(ownerWorkspace, ownerId, 'Safari, iOS')
    const result = await changeOwnPassword(current, { password: 'lantern-harbour-quiet-9083', ip: '192.0.2.10' }, { pool: app, isBreached: noBreach })
    expect(result.ok).toBe(true)
    expect(await verifyPassword(await passwordHashOf(), 'lantern-harbour-quiet-9083')).toBe(true)
    expect([await exists(current), await exists(other)]).toEqual([true, false])
    expect((await actions(ownerWorkspace, 'auth.password_changed')).at(-1)).toEqual({ signedOut: result.ok ? result.signedOut : -1 })
  })

  it('is not offered in a sandbox, where members have no password', async () => {
    const { workspaceId, userId } = await createSandbox(app)
    const session = await device(workspaceId, userId, 'Chrome, Linux')
    expect(await changeOwnPassword(session, { password: 'lantern-harbour-quiet-9083', ip: null }, { pool: app, isBreached: noBreach })).toEqual({ ok: false, error: 'generic' })
  })
})

describe('signed-in devices', () => {
  it('lists one’s own verified sessions only, the most recently active first', async () => {
    const { workspaceId: ws, userId: me } = await createSandbox(app)
    const current = await device(ws, me, 'Chrome, Linux')
    const phone = await device(ws, me, 'Safari, iOS')
    await admin.query("update fa.sessions set last_seen_at = now() + interval '1 minute' where id = $1", [phone.id])
    await admin.query("insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified) values ($1, $2, $3, now() + interval '10 minutes', false)",
      [ws, hashToken(generateToken()), me])
    const admin_ = (await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'admin'", [ws])).rows[0]!.id
    await device(ws, admin_, 'Edge, Windows')
    const listed = await withWorkspace({ workspaceId: ws, userId: me, role: 'owner' }, tx => listOwnSessions(tx, me), app)
    expect(listed.map(s => s.userAgentSummary)).toEqual(['Safari, iOS', 'Chrome, Linux', 'Vitest'])

    expect(await revokeOwnSession(current, current.id, { ip: null }, { pool: app })).toBe(false)
    expect(await revokeOwnSession(current, phone.id, { ip: null }, { pool: app })).toBe(true)
    expect(await exists(phone)).toBe(false)
    expect(await revokeOtherSessions(current, { ip: null }, { pool: app })).toBe(2)
    expect(await exists(current)).toBe(true)
    expect((await withWorkspace({ workspaceId: ws, userId: me, role: 'owner' }, tx => listOwnSessions(tx, me), app)).map(s => s.id)).toEqual([current.id])
    expect(await actions(ws, 'auth.session_revoked')).toEqual([{ device: 'Safari, iOS' }])
    expect(await actions(ws, 'auth.other_sessions_revoked')).toEqual([{ count: 2 }])
    const adminSessions = await admin.query<{ n: number }>('select count(*)::int as n from fa.sessions where workspace_id = $1 and user_id = $2', [ws, admin_])
    expect(adminSessions.rows[0]!.n).toBe(1)
  })
})
