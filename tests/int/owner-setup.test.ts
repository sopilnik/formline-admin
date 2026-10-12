import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validateSessionToken } from '@/server/auth/sessions'
import { setupOwner, type SetupInput } from '@/server/auth/setup'
import { formatTotpSecret } from '@/server/auth/totp'
import { authConfig } from '@/server/config'
import { LIMITS } from '@/server/ratelimit/limits'
import { roomInWindow } from '../windows'
import { adminPool, appPool, closeAll } from './db'
import { TEST_AUTH_ENV } from './env'
import { ensureOwner, nextTotp, noBreach, OWNER, OWNER_TOTP_SECRET } from './owner'

let admin: pg.Pool
let app: pg.Pool
let address = 0

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  // Start without an owner; the successful test below creates it again with the shared values.
  await admin.query("delete from fa.users u using fa.workspaces w where w.id = u.workspace_id and w.kind = 'owner'")
})
afterAll(closeAll)

async function attempt(overrides: Partial<SetupInput> = {}, isBreached = noBreach) {
  const totp = await nextTotp(admin)
  address += 1
  const input: SetupInput = {
    token: TEST_AUTH_ENV.OWNER_SETUP_TOKEN,
    ...OWNER,
    totpSecret: formatTotpSecret(OWNER_TOTP_SECRET),
    code: totp.code,
    ip: `198.51.100.${address}`,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    locale: 'ru',
    theme: 'dark',
    ...overrides,
  }
  return setupOwner(input, { pool: app, now: totp.now, isBreached })
}

async function owners(): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    "select count(*)::int as n from fa.users u join fa.workspaces w on w.id = u.workspace_id where w.kind = 'owner'")
  return rows[0]!.n
}

describe('setupOwner before the owner exists', () => {
  it.each([
    [{ token: 'wrong-token-0123456789abcdef0123456789abcdef' }, 'token_invalid', 'token'],
    [{ name: '   ' }, 'name_required', 'name'],
    [{ email: 'not-an-email' }, 'email_invalid', 'email'],
    [{ password: 'too-short' }, 'password_too_short', 'password'],
    [{ password: 'x'.repeat(129) }, 'password_too_long', 'password'],
    [{ code: '12345' }, 'code_invalid', 'code'],
    [{ totpSecret: 'ABCD' }, 'code_invalid', 'code'],
  ] as const)('refuses %j with %s', async (overrides, error, field) => {
    expect(await attempt(overrides)).toEqual({ ok: false, error, field })
    expect(await owners()).toBe(0)
  })

  it('refuses a password found in a breach', async () => {
    expect(await attempt({}, async () => true)).toEqual({ ok: false, error: 'password_breached', field: 'password' })
  })

  it('is unavailable without a setup token', async () => {
    const totp = await nextTotp(admin)
    const input: SetupInput = { token: 'x'.repeat(40), ...OWNER, totpSecret: formatTotpSecret(OWNER_TOTP_SECRET), code: totp.code, ip: null, userAgent: null, locale: 'en', theme: 'system' }
    expect(await setupOwner(input, { pool: app, now: totp.now, isBreached: noBreach, config: { ...authConfig(), setupToken: null } }))
      .toEqual({ ok: false, error: 'unavailable' })
  })

  it('limits attempts per address', async () => {
    await roomInWindow(LIMITS.setupIp.windowSeconds, 10)
    const results = []
    for (let i = 0; i < 6; i++) {
      const totp = await nextTotp(admin)
      const input: SetupInput = { token: 'wrong-token-0123456789abcdef0123456789abcdef', ...OWNER, totpSecret: formatTotpSecret(OWNER_TOTP_SECRET), code: totp.code, ip: '198.51.100.200', userAgent: null, locale: 'en', theme: 'system' }
      results.push(await setupOwner(input, { pool: app, now: totp.now, isBreached: noBreach }))
    }
    expect(results.slice(0, 5).every(r => !r.ok && r.error === 'token_invalid')).toBe(true)
    expect(results[5]).toMatchObject({ ok: false, error: 'rate_limited' })
  })

  it('create_owner refuses a hash that is not Argon2id and a wrong number of recovery codes', async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `${i}`.padStart(64, 'a'))
    await expect(app.query(
      "select fa.create_owner(gen_random_uuid(), 'x@example.test', 'X', 'plain', null, null, $1::text[], repeat('b', 64), null, null)", [codes],
    )).rejects.toThrow(/Argon2id/)
    await expect(app.query(
      "select fa.create_owner(gen_random_uuid(), 'x@example.test', 'X', '$argon2id$v=19$m=19456,t=2,p=1$x$y', null, null, $1::text[], repeat('b', 64), null, null)", [codes.slice(1)],
    )).rejects.toThrow(/ten recovery codes/)
    expect(await owners()).toBe(0)
  })
})

describe('setupOwner', () => {
  it('creates the owner with an encrypted factor, ten recovery codes and a verified session', async () => {
    const result = await attempt()
    if (!result.ok) throw new Error(result.error)
    expect(result.recoveryCodes).toHaveLength(10)
    const { rows } = await admin.query(
      `select u.id, u.role, u.password_hash, u.totp_secret_enc, u.locale, u.theme,
              (select count(*)::int from fa.recovery_codes r where r.user_id = u.id) as codes
         from fa.users u join fa.workspaces w on w.id = u.workspace_id where w.kind = 'owner'`)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ role: 'owner', locale: 'ru', theme: 'dark', codes: 10 })
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/)
    expect(rows[0].totp_secret_enc).toMatch(/^test1\./)
    const session = await validateSessionToken(result.token, app)
    expect(session).toMatchObject({ userId: rows[0].id, role: 'owner', workspaceKind: 'owner', secondFactorVerified: true })
    const activity = await admin.query('select action from fa.activity_log where entity_id = $1', [rows[0].id])
    expect(activity.rows.map(r => r.action)).toContain('auth.owner_created')
  })

  it('refuses a second owner', async () => {
    await ensureOwner(admin, app)
    expect(await attempt({ email: 'second@formline.test' })).toEqual({ ok: false, error: 'owner_exists' })
    expect(await owners()).toBe(1)
  })
})
