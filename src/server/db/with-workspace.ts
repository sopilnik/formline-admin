import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { z } from 'zod'
import { getPool } from '@/server/db/pool'
import * as schema from '@/server/db/schema'

/** A member's role, as the database's `fa.role` enum has it. */
export type Role = (typeof schema.roleEnum.enumValues)[number]
export type WorkspaceContext = { workspaceId: string; userId: string | null; role: Role | 'system' }
export type Tx = NodePgDatabase<typeof schema>

/**
 * No statement of a workspace transaction runs longer: the slowest query the panel makes takes well under a second.
 * Statements on the bare pool (the rate-limit counters, sandbox creation, the daily job) fall under the same bound
 * through the app role's own default, which the migrator sets (scripts/migrate.ts), with a 10 s bound on lock waits.
 */
const STATEMENT_TIMEOUT = '30s'

const contextSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid().nullable(),
  role: z.enum([...schema.roleEnum.enumValues, 'system']),
})

export function parseWorkspaceContext(ctx: WorkspaceContext): WorkspaceContext {
  return contextSchema.parse(ctx)
}

/** The identity a member's transaction runs as, from their session or from an actor alike. */
export function workspaceContext(who: { workspaceId: string; userId: string; role: Role }): WorkspaceContext {
  return { workspaceId: who.workspaceId, userId: who.userId, role: who.role }
}

/**
 * The only way the application touches workspace data: one transaction whose
 * request identity (workspace, user, role) row-level security reads. The
 * settings are transaction-local, so a pooled connection carries nothing over.
 */
export async function withWorkspace<T>(ctx: WorkspaceContext, fn: (tx: Tx) => Promise<T>, pool: Pool = getPool()): Promise<T> {
  const checked = parseWorkspaceContext(ctx)

  return withWorkspaces(async enter => fn(await enter(checked)), pool)
}

/**
 * One transaction across workspaces, which only the order ingest uses: the owner's order and its
 * pseudonymised copy in the template commit together or not at all. `enter` sets the identity of the statements
 * that follow it, and row-level security checks each statement against the identity entered last.
 */
export async function withWorkspaces<T>(fn: (enter: (ctx: WorkspaceContext) => Promise<Tx>) => Promise<T>, pool: Pool = getPool()): Promise<T> {
  const client = await pool.connect()
  let broken = false

  try {
    await client.query('begin')

    const tx = drizzle({ client, schema })
    const result = await fn(async ctx => {
      const { workspaceId, userId, role } = parseWorkspaceContext(ctx)

      // The statement timeout is set here, per transaction: the pooler refuses it as a connection parameter.
      await client.query(
        `select set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true), set_config('app.role', $3, true),
                set_config('statement_timeout', $4, true)`,
        [workspaceId, userId ?? '', role, STATEMENT_TIMEOUT])

      return tx
    })

    await client.query('commit')

    return result
  } catch (error) {
    await client.query('rollback').catch(() => { broken = true })

    throw error
  } finally {
    client.release(broken)
  }
}
