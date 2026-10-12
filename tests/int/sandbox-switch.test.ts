import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateHOTP } from '@/lib/otp'
import { validateSessionToken, type Session } from '@/server/auth/sessions'
import { encryptTotpSecret } from '@/server/auth/totp'
import { authConfig } from '@/server/config'
import { LIMITS, SECOND_FACTOR_LOCK_SECONDS } from '@/server/ratelimit/limits'
import { switchUser } from '@/server/sandbox/sign-in-as'
import { roomInWindow } from '../windows'
import { adminPool, appPool, closeAll } from './db'
import { asSchemaOwner, createSandbox, memberIds, type MemberRole } from './fixtures'

let admin: pg.Pool
let app: pg.Pool

const meta = { userAgentSummary: 'Vitest', ipHash: null, preferences: { locale: 'en' as const, theme: 'system' as const } }

async function enter(): Promise<{ session: Session; token: string; users: Record<MemberRole, string> }> {
  const { token } = await createSandbox(app)
  const session = (await validateSessionToken(token, app))!
  return { session, token, users: await memberIds(admin, session.workspaceId) }
}

/** Gives a member of a sandbox an authenticator with this key. */
async function enrol(workspaceId: string, userId: string, secret: Uint8Array): Promise<void> {
  const encrypted = encryptTotpSecret(secret, { workspaceId, userId }, authConfig().totpKeys)
  await asSchemaOwner(admin, c => c.query('update fa.users set totp_secret_enc = $3 where workspace_id = $1 and id = $2', [workspaceId, userId, encrypted]))
}

beforeAll(() => {
  admin = adminPool()
  app = appPool()
})
afterAll(closeAll)

describe('switchUser', () => {
  it('hands the visitor\'s language and theme to the member it continues as, and to nobody else', async () => {
    const { session, users } = await enter()
    const result = await switchUser(session, { targetUserId: users.admin!, code: '', ...meta, preferences: { locale: 'ru', theme: 'dark' } }, { pool: app })
    expect(result.ok).toBe(true)
    const rows = await admin.query<{ role: string; locale: string; theme: string }>('select role, locale, theme from fa.users where workspace_id = $1', [session.workspaceId])
    const members = Object.fromEntries(rows.rows.map(r => [r.role, `${r.locale} ${r.theme}`]))
    expect(members).toEqual({ owner: 'en system', admin: 'ru dark', manager: 'en system', viewer: 'en system' })
  })

  it('hands the visitor\'s shortcut switch to the member too', async () => {
    const { session, users } = await enter()
    await asSchemaOwner(admin, c => c.query('update fa.users set shortcuts_enabled = false where workspace_id = $1 and id = $2', [session.workspaceId, session.userId]))
    expect((await switchUser(session, { targetUserId: users.manager!, code: '', ...meta }, { pool: app })).ok).toBe(true)
    const rows = await admin.query<{ role: string; on: boolean }>('select role, shortcuts_enabled as on from fa.users where workspace_id = $1', [session.workspaceId])
    expect(Object.fromEntries(rows.rows.map(r => [r.role, r.on]))).toEqual({ owner: false, admin: true, manager: false, viewer: true })
  })

  it('replaces the session with one of the target user and logs the switch', async () => {
    const { session, token, users } = await enter()
    const result = await switchUser(session, { targetUserId: users.viewer!, code: '', ...meta }, { pool: app })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(await validateSessionToken(token, app)).toBeNull()
    const next = await validateSessionToken(result.token, app)
    expect(next).toMatchObject({ workspaceId: session.workspaceId, userId: users.viewer, role: 'viewer', secondFactorVerified: true })
    const expiry = await admin.query<{ same: boolean }>('select s.expires_at = w.expires_at as same from fa.sessions s join fa.workspaces w on w.id = s.workspace_id where s.id = $1', [result.id])
    expect(expiry.rows[0]?.same).toBe(true)
    const log = await admin.query<{ actor_user_id: string; entity_id: string }>(
      "select actor_user_id, entity_id from fa.activity_log where workspace_id = $1 and action = 'sandbox.switched_user'", [session.workspaceId])
    expect(log.rows).toEqual([{ actor_user_id: session.userId, entity_id: users.viewer }])
  })

  it('asks a user with an authenticator for a valid code and stores the accepted step', async () => {
    const { session, users } = await enter()
    const secret = new Uint8Array(20).fill(9)
    const encrypted = encryptTotpSecret(secret, { workspaceId: session.workspaceId, userId: users.admin! }, authConfig().totpKeys)
    await asSchemaOwner(admin, c => c.query('update fa.users set totp_secret_enc = $3 where workspace_id = $1 and id = $2', [session.workspaceId, users.admin, encrypted]))
    const wrong = await switchUser(session, { targetUserId: users.admin!, code: '000000', ...meta }, { pool: app })
    expect(wrong).toMatchObject({ ok: false, error: 'code_invalid', field: 'code' })
    const step = Math.floor(Date.now() / 30_000) + 50
    const code = generateHOTP(secret, BigInt(step), 6)
    const now = () => step * 30_000 + 5_000
    const right = await switchUser(session, { targetUserId: users.admin!, code, ...meta }, { pool: app, now })
    expect(right.ok).toBe(true)
    if (!right.ok) return
    expect((await validateSessionToken(right.token, app))?.role).toBe('admin')
    const stored = await admin.query<{ step: string }>('select totp_last_step as step from fa.users where workspace_id = $1 and id = $2', [session.workspaceId, users.admin])
    expect(Number(stored.rows[0]?.step)).toBe(step)
    // Codes work once: the same code from the admin's new session, back to the admin, is refused.
    const admin2 = (await validateSessionToken(right.token, app))!
    const replay = await switchUser(admin2, { targetUserId: users.viewer!, code: '', ...meta }, { pool: app, now })
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    const viewer = (await validateSessionToken(replay.token, app))!
    expect(await switchUser(viewer, { targetUserId: users.admin!, code, ...meta }, { pool: app, now })).toMatchObject({ ok: false, error: 'code_invalid' })
  })

  it('locks a member\'s authenticator at the tenth wrong code, in that sandbox only, and logs and notifies it', async () => {
    await roomInWindow(LIMITS.secondFactorFail.windowSeconds, 10)
    const a = await enter()
    const b = await enter()
    const secret = new Uint8Array(20).fill(7)
    await enrol(a.session.workspaceId, a.users.admin!, secret)
    await enrol(b.session.workspaceId, b.users.admin!, secret)

    const wrong = () => switchUser(a.session, { targetUserId: a.users.admin!, code: '000000', ...meta }, { pool: app })
    for (let i = 1; i < LIMITS.secondFactorFail.limit; i++) expect(await wrong()).toMatchObject({ ok: false, error: 'code_invalid' })
    expect(await wrong()).toMatchObject({ ok: false, error: 'second_factor_locked', retryAfterSeconds: SECOND_FACTOR_LOCK_SECONDS })

    const log = await admin.query("select actor_user_id from fa.activity_log where workspace_id = $1 and action = 'auth.second_factor_locked'", [a.session.workspaceId])
    expect(log.rows).toEqual([{ actor_user_id: a.users.admin }])
    const notices = await admin.query<{ n: number }>(
      "select count(*)::int as n from fa.notifications where workspace_id = $1 and user_id = $2 and kind = 'auth.second_factor_locked'", [a.session.workspaceId, a.users.admin])
    expect(notices.rows[0]?.n).toBe(1)

    // b's admin carries the same id as a's, but its own counters and lock: the right code still lets b switch.
    const step = Math.floor(Date.now() / 30_000) + 50
    const now = () => step * 30_000 + 5_000
    const code = generateHOTP(secret, BigInt(step), 6)
    expect((await switchUser(b.session, { targetUserId: b.users.admin!, code, ...meta }, { pool: app, now })).ok).toBe(true)
  })

  it('refuses a deactivated member, oneself and an unknown id, and never crosses into another sandbox', async () => {
    const a = await enter()
    const b = await enter()
    await asSchemaOwner(admin, c => c.query('update fa.users set deactivated_at = now() where workspace_id = $1 and id = $2', [a.session.workspaceId, a.users.manager]))
    expect(await switchUser(a.session, { targetUserId: a.users.manager!, code: '', ...meta }, { pool: app })).toMatchObject({ ok: false, error: 'generic' })
    expect(await switchUser(a.session, { targetUserId: a.session.userId, code: '', ...meta }, { pool: app })).toMatchObject({ ok: false, error: 'generic' })
    expect(await switchUser(a.session, { targetUserId: randomUUID(), code: '', ...meta }, { pool: app })).toMatchObject({ ok: false, error: 'generic' })
    expect(await validateSessionToken(a.token, app)).not.toBeNull()
    // Every sandbox copies the template's user ids, so b's viewer carries the same id as a's own viewer.
    // The workspace comes from the caller's session, never from the target: the switch lands in a, and b is untouched.
    expect(b.users.viewer).toBe(a.users.viewer)
    const crossed = await switchUser(a.session, { targetUserId: b.users.viewer!, code: '', ...meta }, { pool: app })
    expect(crossed.ok).toBe(true)
    if (!crossed.ok) return
    expect(await validateSessionToken(crossed.token, app)).toMatchObject({ workspaceId: a.session.workspaceId, userId: a.users.viewer })
    expect(await validateSessionToken(b.token, app)).toMatchObject({ workspaceId: b.session.workspaceId, userId: b.session.userId })
    const sessions = await admin.query<{ n: string }>('select count(*) as n from fa.sessions where workspace_id = $1', [b.session.workspaceId])
    expect(Number(sessions.rows[0]?.n)).toBe(1)
  })

  it('is not for the owner workspace', async () => {
    const { session, token, users } = await enter()
    const ownerLike: Session = { ...session, workspaceKind: 'owner' }
    // A real member without an authenticator: only the workspace guard stands between the caller and the switch.
    expect(await switchUser(ownerLike, { targetUserId: users.admin, code: '', ...meta }, { pool: app })).toMatchObject({ ok: false, error: 'generic' })
    expect(await validateSessionToken(token, app)).toMatchObject({ userId: session.userId })
    const logged = await admin.query("select 1 from fa.activity_log where workspace_id = $1 and action = 'sandbox.switched_user'", [session.workspaceId])
    expect(logged.rowCount).toBe(0)
  })
})
