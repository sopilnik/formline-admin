import type pg from 'pg'

export class Rollback extends Error {}

/** Runs fn in a transaction that is always rolled back; returns fn's result. */
export async function inRollback<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    return await fn(client)
  } finally {
    await client.query('rollback')
    client.release()
  }
}

/** Runs fn as schema_owner (the identity of the definer functions) and commits. */
export async function asSchemaOwner<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
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
    client.release()
  }
}

export async function createWorkspace(pool: pg.Pool, kind: 'sandbox' | 'owner' | 'template' = 'sandbox'): Promise<string> {
  const expires = kind === 'sandbox' ? "now() + interval '1 day'" : 'null'
  const { rows } = await pool.query<{ id: string }>(`insert into fa.workspaces (kind, expires_at) values ($1, ${expires}) returning id`, [kind])
  return rows[0]!.id
}

export async function createUser(pool: pg.Pool, workspaceId: string, role: 'owner' | 'admin' | 'manager' | 'viewer', email = `${role}.${crypto.randomUUID()}@example.test`): Promise<string> {
  return asSchemaOwner(pool, async c => {
    const { rows } = await c.query<{ id: string }>(
      'insert into fa.users (workspace_id, email, name, role) values ($1, $2, $3, $4) returning id',
      [workspaceId, email, `Test ${role}`, role])
    return rows[0]!.id
  })
}
