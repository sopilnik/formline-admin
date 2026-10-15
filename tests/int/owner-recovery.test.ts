import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encodeBase32LowerCaseNoPadding } from '@/lib/encoding'
import { recoverOwner, type RecoverInput } from '@/server/auth/recovery'
import { createSession, validateSessionToken } from '@/server/auth/sessions'
import { signInWithPassword } from '@/server/auth/sign-in'
import { hashToken } from '@/server/auth/tokens'
import { formatTotpSecret } from '@/server/auth/totp'
import { withWorkspace } from '@/server/db/with-workspace'
import { lockRemaining, setLock } from '@/server/ratelimit/consume'
import { userSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'
import { roomInWindow } from '../windows'
import { adminPool, appPool, closeAll } from './db'
import { asSchemaOwner } from './fixtures'
import { ensureOwner, nextTotp, noBreach, OWNER, OWNER_TOTP_SECRET } from './owner'

let admin: pg.Pool
let app: pg.Pool
let ownerId: string
let ownerWorkspace: string
let address = 0

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  ownerId = await ensureOwner(admin, app)
  ownerWorkspace = (await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
})
afterAll(async () => {
  // The owner is shared by every auth test file: a recovery with the shared values puts the password and the authenticator
  // back, whatever a test below left.
  expect((await recover(await issue())).ok).toBe(true)
  await closeAll()
})

/** Issues a code the way the CLI does: as schema_owner. */
async function issue(): Promise<string> {
  const code = encodeBase32LowerCaseNoPadding(crypto.getRandomValues(new Uint8Array(20)))

  await asSchemaOwner(admin, c => c.query('select fa.issue_owner_recovery($1)', [hashToken(code)]))

  return code
}

/** Recovers with the shared owner values unless told otherwise, so later tests still sign in with them. */
async function recover(recoveryCode: string, overrides: Partial<RecoverInput> = {}) {
  const totp = await nextTotp(admin)

  address += 1

  return recoverOwner({
    recoveryCode,
    password: OWNER.password,
    totpSecret: formatTotpSecret(OWNER_TOTP_SECRET),
    code: totp.code,
    ip: `203.0.113.${address}`,
    userAgent: null,
    ...overrides,
  }, { pool: app, now: totp.now, isBreached: noBreach })
}

const count = async (sql: string, params: unknown[]) => (await admin.query<{ n: number }>(sql, params)).rows[0]!.n

describe('owner recovery', () => {
  it('cannot be issued by the application role', async () => {
    await expect(app.query('select fa.issue_owner_recovery($1)', ['a'.repeat(64)])).rejects.toThrow(/permission denied/)
  })

  it('replaces the password, the authenticator and the recovery codes, ends every passkey and session, and lifts the locks', async () => {
    const old = await withWorkspace({ workspaceId: ownerWorkspace, userId: ownerId, role: 'system' },
      tx => createSession(tx, { workspaceId: ownerWorkspace, userId: ownerId, verified: true, userAgentSummary: null, ipHash: null }), app)

    await admin.query("insert into fa.passkeys (workspace_id, user_id, credential_id, public_key, name) values ($1, $2, $3, 'pk', 'Old laptop')",
      [ownerWorkspace, ownerId, `lost${crypto.randomUUID().replace(/-/g, '')}`])
    await setLock('mfa.lock', { subject: userSubject(ownerWorkspace, ownerId), seconds: 3600 }, app)

    const result = await recover(await issue(), { password: 'brand-new-password-5582' })

    if (!result.ok) throw new Error(result.error)
    expect(result.recoveryCodes).toHaveLength(10)
    expect(await validateSessionToken(old.token, app)).toBeNull()
    expect(await count('select count(*)::int as n from fa.passkeys where user_id = $1', [ownerId])).toBe(0)
    expect(await count('select count(*)::int as n from fa.recovery_codes where user_id = $1 and used_at is null', [ownerId])).toBe(10)
    expect(await validateSessionToken(result.token, app)).toMatchObject({ userId: ownerId, secondFactorVerified: true })
    expect(await lockRemaining('mfa.lock', userSubject(ownerWorkspace, ownerId), app)).toBe(0)
    expect((await signInWithPassword({ email: OWNER.email, password: 'brand-new-password-5582', ip: '203.0.113.200', userAgent: null }, { pool: app })).ok).toBe(true)
    expect(await signInWithPassword({ email: OWNER.email, password: OWNER.password, ip: '203.0.113.201', userAgent: null }, { pool: app }))
      .toEqual({ ok: false, error: 'credentials_invalid' })
  })

  it('takes a code once', async () => {
    const code = await issue()

    expect((await recover(code)).ok).toBe(true)
    expect(await recover(code)).toEqual({ ok: false, error: 'recovery_invalid', field: 'recoveryCode' })
  })

  it('refuses an expired code', async () => {
    const code = await issue()

    await admin.query("update fa.owner_recovery_codes set expires_at = now() - interval '1 second' where code_hash = $1", [hashToken(code)])
    expect(await recover(code)).toEqual({ ok: false, error: 'recovery_invalid', field: 'recoveryCode' })
  })

  it('keeps only the newest unused code', async () => {
    const first = await issue()
    const second = await issue()

    expect(await recover(first)).toEqual({ ok: false, error: 'recovery_invalid', field: 'recoveryCode' })
    expect((await recover(second)).ok).toBe(true)
  })

  it('refuses a malformed code and a weak new password before spending the code', async () => {
    expect(await recover('short')).toEqual({ ok: false, error: 'recovery_invalid', field: 'recoveryCode' })

    const code = await issue()

    expect(await recover(code, { password: 'too-short' })).toEqual({ ok: false, error: 'password_too_short', field: 'password' })
    expect((await recover(code)).ok).toBe(true)
  })

  it('limits attempts per address', async () => {
    await roomInWindow(LIMITS.recoverIp.windowSeconds, 10)

    const results = []

    for (let i = 0; i < 6; i++) {
      const totp = await nextTotp(admin)

      results.push(await recoverOwner({ recoveryCode: 'a'.repeat(32), password: OWNER.password, totpSecret: formatTotpSecret(OWNER_TOTP_SECRET), code: totp.code, ip: '203.0.113.250', userAgent: null }, { pool: app, now: totp.now, isBreached: noBreach }))
    }
    expect(results[5]).toMatchObject({ ok: false, error: 'rate_limited' })
  })
})
