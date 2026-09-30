import type pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isRecentAuth, reauthenticate } from '@/server/auth/reauth'
import { generateRecoveryCodes, hashRecoveryCode } from '@/server/auth/recovery-codes'
import { verifySecondFactor } from '@/server/auth/second-factor'
import { validateSessionToken, type Session } from '@/server/auth/sessions'
import { signInWithPassword, type SignInInput } from '@/server/auth/sign-in'
import { hashToken } from '@/server/auth/tokens'
import { clearSubject, lockRemaining } from '@/server/ratelimit/consume'
import { accountSubject, userSubject } from '@/server/ratelimit/ip'
import { adminPool, appPool, closeAll } from './db'
import { TEST_AUTH_ENV } from './env'
import { ensureOwner, nextTotp, OWNER } from './owner'

let admin: pg.Pool
let app: pg.Pool
let ownerId: string
let address = 0
const nextIp = () => `192.0.2.${++address}`
const account = accountSubject(OWNER.email, TEST_AUTH_ENV.IP_HASH_KEY)

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  ownerId = await ensureOwner(admin, app)
})
// Every test starts without counters or locks on the owner.
beforeEach(async () => {
  await clearSubject(account, app)
  await clearSubject(userSubject(ownerId), app)
})
afterAll(async () => {
  await clearSubject(account, app)
  await clearSubject(userSubject(ownerId), app)
  await closeAll()
})

const correct = (overrides: Partial<SignInInput> = {}): SignInInput =>
  ({ email: OWNER.email, password: OWNER.password, ip: nextIp(), userAgent: null, ...overrides })

async function pendingSession(): Promise<Session> {
  const result = await signInWithPassword(correct(), { pool: app })
  if (!result.ok) throw new Error(result.error)
  return (await validateSessionToken(result.token, app))!
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return (await admin.query<{ n: number }>(sql, params)).rows[0]!.n
}
const letters = (template: string) =>
  count('select count(*)::int as n from fa.outbox_emails where template = $1 and to_address = $2', [template, OWNER.email])
const sessionExists = async (session: Session) =>
  (await count('select count(*)::int as n from fa.sessions where id = $1', [session.id])) === 1

describe('password step', () => {
  it('refuses a wrong password and an unknown email the same way, and logs both', async () => {
    const before = await count("select count(*)::int as n from fa.activity_log where action = 'auth.sign_in_failed'")
    expect(await signInWithPassword(correct({ password: 'wrong-password-123' }), { pool: app })).toEqual({ ok: false, error: 'credentials_invalid' })
    expect(await signInWithPassword(correct({ email: 'nobody@formline.test' }), { pool: app })).toEqual({ ok: false, error: 'credentials_invalid' })
    expect(await count("select count(*)::int as n from fa.activity_log where action = 'auth.sign_in_failed'")).toBe(before + 2)
  })

  it('finds the account whatever the case of the email, and gives a pending session only', async () => {
    const result = await signInWithPassword(correct({ email: ' OWNER@Formline.test ' }), { pool: app })
    if (!result.ok) throw new Error(result.error)
    expect(await validateSessionToken(result.token, app)).toMatchObject({ userId: ownerId, secondFactorVerified: false })
  })

  it('locks the account for 15 minutes after five failures, from any address', async () => {
    for (let i = 0; i < 5; i++) await signInWithPassword(correct({ password: `wrong-password-${i}` }), { pool: app })
    const locked = await signInWithPassword(correct(), { pool: app })
    if (locked.ok) throw new Error('not locked')
    expect(locked.error).toBe('rate_limited')
    expect(locked.retryAfterSeconds).toBeGreaterThan(890)
    expect(locked.retryAfterSeconds).toBeLessThanOrEqual(900)
  })

  it('allows ten successful passwords an hour per account', async () => {
    for (let i = 0; i < 10; i++) expect((await signInWithPassword(correct(), { pool: app })).ok).toBe(true)
    expect(await signInWithPassword(correct(), { pool: app })).toMatchObject({ ok: false, error: 'rate_limited' })
  })

  it('stops an address after twenty failures, even with the right password', async () => {
    const ip = nextIp()
    for (let i = 0; i < 20; i++) await signInWithPassword(correct({ email: `nobody.${i}@formline.test`, ip }), { pool: app })
    expect(await signInWithPassword(correct({ ip }), { pool: app })).toMatchObject({ ok: false, error: 'rate_limited' })
  })
})

describe('second-factor step', () => {
  it('an authenticator code completes the sign-in once and tells the owner', async () => {
    const lettersBefore = await letters('auth.new_sign_in')
    const pending = await pendingSession()
    const totp = await nextTotp(admin)
    const done = await verifySecondFactor(pending, { code: totp.code, ip: nextIp(), userAgent: null }, { pool: app, now: totp.now })
    if (!done.ok) throw new Error(done.error)
    expect(await validateSessionToken(done.token, app)).toMatchObject({ userId: ownerId, secondFactorVerified: true })
    expect(await sessionExists(pending)).toBe(false)
    expect(await letters('auth.new_sign_in')).toBe(lettersBefore + 1)
    expect(await count("select count(*)::int as n from fa.notifications where user_id = $1 and kind = 'auth.new_sign_in'", [ownerId])).toBeGreaterThan(0)
    // The bell's copy names the sign-in, which the new session carries (migration 0014).
    const notice = await admin.query<{ sign_in: string }>(
      "select payload->>'signIn' as sign_in from fa.notifications where user_id = $1 and kind = 'auth.new_sign_in' order by created_at desc limit 1", [ownerId])
    const signedIn = await admin.query<{ sign_in_id: string }>('select sign_in_id from fa.sessions where id = $1', [hashToken(done.token)])
    expect(notice.rows[0]!.sign_in).toBe(signedIn.rows[0]!.sign_in_id)
    const again = await pendingSession()
    expect(await verifySecondFactor(again, { code: totp.code, ip: nextIp(), userAgent: null }, { pool: app, now: totp.now }))
      .toEqual({ ok: false, error: 'code_invalid', field: 'code' })
  })

  it('a recovery code works once, in any typed form, and is reported', async () => {
    const [code] = generateRecoveryCodes()
    await admin.query('insert into fa.recovery_codes (workspace_id, user_id, code_hash) select workspace_id, id, $2 from fa.users where id = $1', [ownerId, hashRecoveryCode(code!)])
    const lettersBefore = await letters('auth.recovery_code_used')
    const done = await verifySecondFactor(await pendingSession(), { code: code!.toUpperCase(), ip: nextIp(), userAgent: null }, { pool: app })
    expect(done.ok).toBe(true)
    expect(await letters('auth.recovery_code_used')).toBe(lettersBefore + 1)
    expect(await verifySecondFactor(await pendingSession(), { code: code!, ip: nextIp(), userAgent: null }, { pool: app }))
      .toEqual({ ok: false, error: 'code_invalid', field: 'code' })
  })

  it('ten wrong codes lock the second factor for an hour, end the session and notify', async () => {
    const lettersBefore = await letters('auth.second_factor_locked')
    const pending = await pendingSession()
    const results = []
    for (let i = 0; i < 10; i++) results.push(await verifySecondFactor(pending, { code: '12345', ip: nextIp(), userAgent: null }, { pool: app }))
    expect(results.slice(0, 9).every(r => !r.ok && r.error === 'code_invalid')).toBe(true)
    expect(results[9]).toEqual({ ok: false, error: 'second_factor_locked' })
    expect(await sessionExists(pending)).toBe(false)
    expect(await lockRemaining('mfa.lock', userSubject(ownerId), 3600, app)).toBeGreaterThan(3590)
    expect(await letters('auth.second_factor_locked')).toBe(lettersBefore + 1)
    const next = await pendingSession()
    const totp = await nextTotp(admin)
    expect(await verifySecondFactor(next, { code: totp.code, ip: nextIp(), userAgent: null }, { pool: app, now: totp.now }))
      .toEqual({ ok: false, error: 'second_factor_locked' })
    expect(await sessionExists(next)).toBe(false)
  })
})

describe('re-authentication', () => {
  async function verifiedSession(): Promise<Session> {
    const totp = await nextTotp(admin)
    const done = await verifySecondFactor(await pendingSession(), { code: totp.code, ip: nextIp(), userAgent: null }, { pool: app, now: totp.now })
    if (!done.ok) throw new Error(done.error)
    return (await validateSessionToken(done.token, app))!
  }

  it('rotates the session after the password and a code', async () => {
    const session = await verifiedSession()
    const old = { ...session, reauthAt: new Date(Date.now() - 60 * 60_000) }
    expect(isRecentAuth(old)).toBe(false)
    const totp = await nextTotp(admin)
    const result = await reauthenticate(old, { password: OWNER.password, code: totp.code, ip: nextIp(), userAgent: null }, { pool: app, now: totp.now })
    if (!result.ok) throw new Error(result.error)
    expect(await sessionExists(session)).toBe(false)
    const fresh = await validateSessionToken(result.token, app)
    expect(fresh && isRecentAuth(fresh)).toBe(true)
  })

  it('refuses a wrong password without touching the session', async () => {
    const session = await verifiedSession()
    expect(await reauthenticate(session, { password: 'wrong-password-123', code: '000000', ip: nextIp(), userAgent: null }, { pool: app }))
      .toEqual({ ok: false, error: 'credentials_invalid', field: 'password' })
    expect(await sessionExists(session)).toBe(true)
  })
})
