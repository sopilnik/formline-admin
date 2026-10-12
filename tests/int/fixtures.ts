import { setTimeout as sleep } from 'node:timers/promises'
import type pg from 'pg'

export class Rollback extends Error {}

/** The Postgres text of an error: drizzle-orm wraps it and keeps the original on `cause`. */
export function errorText(error: unknown): string {
  const parts: string[] = []
  for (let e: unknown = error; e instanceof Error; e = e.cause) parts.push(e.message)
  return parts.length > 0 ? parts.join(' | ') : String(error)
}

/** A promise the test opens when it chooses: it keeps one transaction open while a second save runs into it. */
export function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void
  const wait = new Promise<void>(resolve => { open = resolve })
  return { wait, open }
}

/** Resolves once a backend of this database waits for a lock: the second of two racing saves has run into the first. */
export async function lockWaiter(admin: pg.Pool): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { rows } = await admin.query<{ n: number }>(
      "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'")
    if (rows[0]!.n > 0) return
    await sleep(25)
  }
  throw new Error('no save waited for a lock')
}

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
