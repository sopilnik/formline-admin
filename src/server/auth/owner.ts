import 'server-only'
import { eq } from 'drizzle-orm'
import type { Pool } from 'pg'
import { getPool } from '@/server/db/pool'
import { users } from '@/server/db/schema'
import { withWorkspace } from '@/server/db/with-workspace'

let ownerWorkspace: string | undefined

/** The owner workspace never changes once the migrations ran, so its id is read once per process. */
export async function ownerWorkspaceId(pool: Pool = getPool()): Promise<string> {
  if (ownerWorkspace) {
    return ownerWorkspace
  }

  const { rows } = await pool.query<{ id: string | null }>('select fa.owner_workspace_id() as id')
  const id = rows[0]?.id

  if (!id) {
    throw new Error('the owner workspace does not exist; run the migrations')
  }

  ownerWorkspace = id

  return id
}

/** The owner, or null before /setup; read as the system role of the owner workspace. */
export async function findOwner(pool: Pool = getPool()): Promise<{ id: string; email: string } | null> {
  const workspaceId = await ownerWorkspaceId(pool)
  const [row] = await withWorkspace(
    { workspaceId, userId: null, role: 'system' },
    tx => tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, 'owner')).limit(1),
    pool,
  )

  return row ?? null
}
