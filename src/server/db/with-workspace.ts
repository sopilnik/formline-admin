import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { z } from 'zod'
import { getPool } from '@/server/db/pool'
import * as schema from '@/server/db/schema'

export type Role = 'owner' | 'admin' | 'manager' | 'viewer'
export type WorkspaceContext = { workspaceId: string; userId: string | null; role: Role | 'system' }
export type Tx = NodePgDatabase<typeof schema>

const contextSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid().nullable(),
  role: z.enum(['owner', 'admin', 'manager', 'viewer', 'system']),
})

export function parseWorkspaceContext(ctx: WorkspaceContext): WorkspaceContext {
  return contextSchema.parse(ctx)
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
 * One transaction across workspaces, which only the order ingest uses (spec §7.3): the owner's order and its
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
      await client.query(
        "select set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true), set_config('app.role', $3, true)",
        [workspaceId, userId ?? '', role])
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
