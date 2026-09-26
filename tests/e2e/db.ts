import { encodeBase32LowerCaseNoPadding } from '@oslojs/encoding'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { E2E_MIGRATOR_URL } from './constants'

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

/**
 * A sandbox workspace with one user of the given role and a verified session; the
 * raw token goes into the cookie. Stage 3's demo button replaces this fixture.
 */
export function createSandboxSession(role: Role = 'owner', name = 'Dana Ortiz'): Promise<{ token: string; workspaceId: string; userId: string }> {
  return asSchemaOwner(async client => {
    const workspace = await client.query<{ id: string }>("insert into fa.workspaces (kind, expires_at) values ('sandbox', now() + interval '1 day') returning id")
    const workspaceId = workspace.rows[0]!.id
    const user = await client.query<{ id: string }>(
      'insert into fa.users (workspace_id, email, name, role) values ($1, $2, $3, $4) returning id',
      [workspaceId, `${role}.${randomUUID()}@example.test`, name, role])
    const userId = user.rows[0]!.id
    const token = encodeBase32LowerCaseNoPadding(randomBytes(20))
    await client.query(
      "insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at) values ($1, $2, $3, now() + interval '1 day', true, now())",
      [workspaceId, createHash('sha256').update(token).digest('hex'), userId])
    return { token, workspaceId, userId }
  })
}
