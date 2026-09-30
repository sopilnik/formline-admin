import { generateHOTP } from '@oslojs/otp'
import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashRecoveryCode } from '@/server/auth/recovery-codes'
import { disableOwnTotp, enableOwnTotp, regenerateOwnRecoveryCodes } from '@/server/auth/self-factors'
import type { Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { decryptTotpSecret, formatTotpSecret } from '@/server/auth/totp'
import { authConfig } from '@/server/config'
import { adminPool, appPool, closeAll } from './db'
import { ensureOwner } from './owner'

let admin: pg.Pool
let app: pg.Pool
let current: Session
let other: Session

const SECRET = new Uint8Array(20).fill(3)
const STEP = Math.floor(Date.now() / 30_000)
const now = () => STEP * 30_000 + 1_000
const codeAt = (secret: Uint8Array, step = STEP) => generateHOTP(secret, BigInt(step), 6)

async function device(workspaceId: string, userId: string, reauthAt: Date | null = new Date()): Promise<Session> {
  const id = hashToken(generateToken())
  const { rows } = await admin.query<{ role: Session['role']; kind: 'owner' | 'sandbox'; expires_at: Date }>(
    `insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at) values ($1, $2, $3, now() + interval '1 day', true, $4)
     returning (select role from fa.users where workspace_id = $1 and id = $3) as role, (select kind from fa.workspaces where id = $1) as kind, expires_at`,
    [workspaceId, id, userId, reauthAt])
  return { id, workspaceId, workspaceKind: rows[0]!.kind, userId, role: rows[0]!.role, secondFactorVerified: true, reauthAt, expiresAt: rows[0]!.expires_at }
}

const self = async () => (await admin.query<{ totp_secret_enc: string | null; totp_last_step: string | null }>(
  'select totp_secret_enc, totp_last_step from fa.users where workspace_id = $1 and id = $2', [current.workspaceId, current.userId])).rows[0]!
const codeHashes = async () => (await admin.query<{ code_hash: string }>(
  'select code_hash from fa.recovery_codes where workspace_id = $1 and user_id = $2 order by code_hash', [current.workspaceId, current.userId])).rows.map(r => r.code_hash)
const actions = async () => (await admin.query<{ action: string }>(
  "select action from fa.activity_log where workspace_id = $1 and action like 'auth.%' order by at", [current.workspaceId])).rows.map(r => r.action)
const exists = async (session: Session) => (await admin.query('select 1 from fa.sessions where id = $1', [session.id])).rowCount === 1

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  const { rows } = await app.query<{ sandbox_id: string; demo_user_id: string }>(
    'select sandbox_id, demo_user_id from fa.create_sandbox($1, $2, $3, $4)',
    [createHash('sha256').update(randomUUID()).digest('hex'), hashToken(generateToken()), 'Vitest', 'en'])
  // A sandbox member: no fresh sign-in is asked for (spec §5.1).
  current = await device(rows[0]!.sandbox_id, rows[0]!.demo_user_id, null)
  other = await device(rows[0]!.sandbox_id, rows[0]!.demo_user_id, null)
})
afterAll(closeAll)

describe('the authenticator app', () => {
  it('refuses a wrong first code and stores nothing', async () => {
    expect(await enableOwnTotp(current, { secret: formatTotpSecret(SECRET), code: '000000', ip: null }, { pool: app, now })).toEqual({ ok: false, error: 'code_invalid', field: 'code' })
    expect((await self()).totp_secret_enc).toBeNull()
  })

  it('turns on with the key and its first code, with ten recovery codes, and signs the other devices out', async () => {
    const result = await enableOwnTotp(current, { secret: formatTotpSecret(SECRET), code: codeAt(SECRET), ip: null }, { pool: app, now })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.recoveryCodes).toHaveLength(10)
    const stored = await self()
    expect(decryptTotpSecret(stored.totp_secret_enc!, { workspaceId: current.workspaceId, userId: current.userId }, authConfig().totpKeys)).toEqual(SECRET)
    expect(Number(stored.totp_last_step)).toBe(STEP)
    expect(await codeHashes()).toEqual(result.recoveryCodes!.map(hashRecoveryCode).sort())
    expect([await exists(current), await exists(other)]).toEqual([true, false])
  })

  it('is replaced by a new key without new recovery codes', async () => {
    const before = await codeHashes()
    const next = new Uint8Array(20).fill(4)
    const result = await enableOwnTotp(current, { secret: formatTotpSecret(next), code: codeAt(next), ip: null }, { pool: app, now })
    expect(result).toEqual({ ok: true, recoveryCodes: null })
    expect(decryptTotpSecret((await self()).totp_secret_enc!, { workspaceId: current.workspaceId, userId: current.userId }, authConfig().totpKeys)).toEqual(next)
    expect(await codeHashes()).toEqual(before)
  })

  it('makes ten new recovery codes in place of the old ones', async () => {
    const before = await codeHashes()
    const result = await regenerateOwnRecoveryCodes(current, { ip: null }, { pool: app })
    expect(result.ok).toBe(true)
    const after = await codeHashes()
    expect(after).toHaveLength(10)
    expect(after.filter(hash => before.includes(hash))).toEqual([])
  })

  it('turns off, and then no recovery codes are made without a factor', async () => {
    expect(await disableOwnTotp(current, { ip: null }, { pool: app })).toEqual({ ok: true })
    expect((await self()).totp_secret_enc).toBeNull()
    expect(await regenerateOwnRecoveryCodes(current, { ip: null }, { pool: app })).toEqual({ ok: false, error: 'generic' })
    expect(await actions()).toEqual(['auth.totp_enabled', 'auth.totp_replaced', 'auth.recovery_codes_regenerated', 'auth.totp_disabled'])
  })
})

describe('in the owner workspace', () => {
  it('asks for a fresh sign-in and never turns off the last factor', async () => {
    const ownerId = await ensureOwner(admin, app)
    const ownerWorkspace = (await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
    const stale = await device(ownerWorkspace, ownerId, new Date(Date.now() - 3_600_000))
    expect(await disableOwnTotp(stale, { ip: null }, { pool: app })).toEqual({ ok: false, error: 'reauth_required' })
    expect(await regenerateOwnRecoveryCodes(stale, { ip: null }, { pool: app })).toEqual({ ok: false, error: 'reauth_required' })
    const fresh = await device(ownerWorkspace, ownerId)
    const passkeys = await admin.query<{ n: number }>('select count(*)::int as n from fa.passkeys where workspace_id = $1', [ownerWorkspace])
    expect(passkeys.rows[0]!.n).toBe(0)
    expect(await disableOwnTotp(fresh, { ip: null }, { pool: app })).toEqual({ ok: false, error: 'last_factor' })
    const stillThere = await admin.query<{ on: boolean }>('select totp_secret_enc is not null as on from fa.users where workspace_id = $1 and id = $2', [ownerWorkspace, ownerId])
    expect(stillThere.rows[0]!.on).toBe(true)
  })
})
