import { encodeBase32LowerCaseNoPadding, encodeBase64urlNoPadding } from '@oslojs/encoding'
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { E2E_AUTH_ENV, E2E_MIGRATOR_URL } from './constants'

export type Role = 'owner' | 'admin' | 'manager' | 'viewer'

/** Runs fn as schema_owner on the e2e database and commits (the identity of the definer functions). */
export async function asSchemaOwner<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: E2E_MIGRATOR_URL })
  await client.connect()
  try {
    await client.query('begin')
    await client.query('set local role schema_owner')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

/** The sandboxes the fixtures created in this worker; tests/e2e/test.ts deletes each test's own afterwards. */
export const createdSandboxes: string[] = []

/**
 * Deletes sandboxes directly, as the schema owner. A run creates one or more per test, and the demo holds at most 100
 * live sandboxes (spec §6.5): without this a growing suite would fill the cap before it ends.
 */
export async function deleteSandboxes(ids: readonly string[]): Promise<void> {
  if (ids.length > 0) await asSchemaOwner(client => client.query("delete from fa.workspaces where kind = 'sandbox' and id = any($1::uuid[])", [ids]))
}

/**
 * A real sandbox through create_sandbox — the template copy every visitor gets —
 * with a verified session for the user of the given role; the raw token goes into
 * the cookie. A random address hash keeps the fixture outside the per-address limit.
 */
export function createSandboxSession(role: Role = 'owner'): Promise<{ token: string; workspaceId: string; userId: string }> {
  return asSchemaOwner(async client => {
    const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
    const entryToken = encodeBase32LowerCaseNoPadding(randomBytes(20))
    const entry = await client.query<{ outcome: string; sandbox_id: string; demo_user_id: string }>(
      'select * from fa.create_sandbox($1, $2, $3, $4)', [sha256(randomUUID()), sha256(entryToken), 'Playwright', 'en'])
    const row = entry.rows[0]
    if (row?.outcome !== 'created') throw new Error(`create_sandbox: ${row?.outcome ?? 'no row'}`)
    createdSandboxes.push(row.sandbox_id)
    if (role === 'owner') return { token: entryToken, workspaceId: row.sandbox_id, userId: row.demo_user_id }
    const user = await client.query<{ id: string }>('select id from fa.users where workspace_id = $1 and role = $2', [row.sandbox_id, role])
    const token = encodeBase32LowerCaseNoPadding(randomBytes(20))
    await client.query(
      'insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at) values ($1, $2, $3, (select expires_at from fa.workspaces where id = $1), true, now())',
      [row.sandbox_id, sha256(token), user.rows[0]!.id])
    return { token, workspaceId: row.sandbox_id, userId: user.rows[0]!.id }
  })
}

/**
 * Enrols an authenticator on a sandbox user: the same AES-256-GCM envelope as the server's
 * totp module, which is server-only and cannot be imported here (spec §5.3).
 */
export async function enrolAuthenticator(workspaceId: string, userId: string, secret: Uint8Array): Promise<void> {
  const [keyId = '', encoded = ''] = E2E_AUTH_ENV.TOTP_ENCRYPTION_KEYS.split(',')[0]!.split(':')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(encoded, 'base64'), iv, { authTagLength: 16 })
  cipher.setAAD(Buffer.from(`${workspaceId}${userId}`))
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()])
  const part = (bytes: Uint8Array) => encodeBase64urlNoPadding(bytes)
  const value = `${keyId}.${part(iv)}.${part(ciphertext)}.${part(cipher.getAuthTag())}`
  await asSchemaOwner(client => client.query('update fa.users set totp_secret_enc = $3 where workspace_id = $1 and id = $2', [workspaceId, userId, value]))
}

/**
 * A verified session for the owner, signed in a moment ago. In a whole run the owner tests have created the owner through
 * /setup before this runs; a run of one file creates an owner whose password and authenticator nobody knows.
 */
export function createOwnerSession(): Promise<{ token: string; workspaceId: string; userId: string }> {
  return asSchemaOwner(async client => {
    const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
    const workspaceId = (await client.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
    let userId = (await client.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'owner'", [workspaceId])).rows[0]?.id
    if (!userId) {
      userId = randomUUID()
      const codes = Array.from({ length: 10 }, () => sha256(randomUUID()))
      await client.query('select fa.create_owner($1, $2, $3, $4, null, null, $5, $6, $7, $8)',
        [userId, 'owner@formline.test', 'Alex Owner', `$argon2id$v=19$m=19456,t=2,p=1$${randomUUID()}`, codes, sha256(randomUUID()), 'Playwright', sha256(randomUUID())])
    }
    const token = encodeBase32LowerCaseNoPadding(randomBytes(20))
    await client.query(
      "insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at) values ($1, $2, $3, now() + interval '1 day', true, now())",
      [workspaceId, sha256(token), userId])
    return { token, workspaceId, userId }
  })
}

/** Moves the owner's last authentication an hour back, as if the ten minutes had long passed. */
export async function ageOwnerAuthentication(): Promise<void> {
  await asSchemaOwner(client => client.query(
    "update fa.sessions s set reauth_at = now() - interval '1 hour' from fa.users u where u.workspace_id = s.workspace_id and u.id = s.user_id and u.role = 'owner'"))
}
