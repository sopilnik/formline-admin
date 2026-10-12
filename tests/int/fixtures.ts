import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import type pg from 'pg'
import type { Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'

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

/** An address hash nobody else has: it keeps a test outside the per-address limits. */
export const randomIpHash = (): string => createHash('sha256').update(randomUUID()).digest('hex')

export type Sandbox = { workspaceId: string; userId: string; token: string; expiresAt: Date }

/**
 * A sandbox as a visitor's entry makes it: create_sandbox from a fresh address, with the demo owner's session opened
 * under the hash of `token`. tests/int/setup.ts deletes it when the file ends.
 */
export async function createSandbox(app: pg.Pool, { locale = 'en', ipHash = randomIpHash() }: { locale?: string; ipHash?: string } = {}): Promise<Sandbox> {
  const token = generateToken()
  const { rows } = await app.query<{ outcome: string; sandbox_id: string; demo_user_id: string; sandbox_expires_at: Date }>(
    'select outcome, sandbox_id, demo_user_id, sandbox_expires_at from fa.create_sandbox($1, $2, $3, $4)', [ipHash, hashToken(token), 'Vitest', locale])
  const row = rows[0]
  if (row?.outcome !== 'created') throw new Error(`create_sandbox answered ${row?.outcome ?? 'nothing'}`)

  return { workspaceId: row.sandbox_id, userId: row.demo_user_id, token, expiresAt: row.sandbox_expires_at }
}

export type MemberRole = 'owner' | 'admin' | 'manager' | 'viewer'

/** The ids of a workspace's members by role, as the template gives every sandbox one of each. */
export async function memberIds(admin: pg.Pool, workspaceId: string): Promise<Record<MemberRole, string>> {
  const { rows } = await admin.query<{ id: string; role: MemberRole }>('select id, role from fa.users where workspace_id = $1', [workspaceId])
  return Object.fromEntries(rows.map(row => [row.role, row.id])) as Record<MemberRole, string>
}

/**
 * A verified session of a member, as the cookie of a signed-in visitor carries it: it ends with its sandbox, or in a day
 * in the owner workspace. Returns the session as the server reads it.
 */
export async function insertSession(
  admin: pg.Pool, workspaceId: string, userId: string,
  { reauthAt = new Date(), userAgent = null }: { reauthAt?: Date | null; userAgent?: string | null } = {},
): Promise<Session> {
  const id = hashToken(generateToken())
  const { rows } = await admin.query<{ role: Session['role']; kind: Session['workspaceKind']; expires_at: Date }>(
    `insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at, user_agent_summary)
     select w.id, $2, $3, coalesce(w.expires_at, now() + interval '1 day'), true, $4, $5 from fa.workspaces w where w.id = $1
     returning (select role from fa.users where workspace_id = $1 and id = $3) as role,
               (select kind from fa.workspaces where id = $1) as kind, expires_at`,
    [workspaceId, id, userId, reauthAt, userAgent])
  const row = rows[0]!

  return { id, workspaceId, workspaceKind: row.kind, userId, role: row.role, secondFactorVerified: true, reauthAt, expiresAt: row.expires_at }
}
