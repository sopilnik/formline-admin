import 'server-only'
import type { Pool } from 'pg'
import { type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { updateCustomerNotes } from '@/server/dal/customers'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

/** Saves a customer's notes and logs a real change: `unchanged` writes nothing. */
export async function saveCustomerNotes(
  actor: Actor,
  { customerId, notes }: { customerId: string; notes: string },
  pool: Pool = getPool(),
): Promise<'saved' | 'unchanged' | 'not_found'> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const result = await updateCustomerNotes(tx, actor.workspaceId, { id: customerId, notes })

    if (!result) return 'not_found'
    if (!result.changed) return 'unchanged'
    await logActivity(tx, actor.workspaceId, {
      actorUserId: actor.userId, action: 'customer.notes_updated', entityType: 'customer', entityId: customerId, details: { name: result.name }, ipHash: actor.ipHash,
    })

    return 'saved'
  }, pool)
}
