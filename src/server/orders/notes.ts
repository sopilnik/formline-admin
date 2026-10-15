import 'server-only'
import type { Pool } from 'pg'
import type { Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { addOrderNote } from '@/server/dal/orders'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

/** Adds an internal note and logs it; the order's number, or null when there is no such order. */
export async function addNote(actor: Actor, orderId: string, note: string, pool: Pool = getPool()): Promise<number | null> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const added = await addOrderNote(tx, { workspaceId: actor.workspaceId, userId: actor.userId }, { orderId, note })

    if (!added) return null
    await logActivity(tx, actor.workspaceId, {
      actorUserId: actor.userId, action: 'order.note_added', entityType: 'order', entityId: orderId, details: { number: added.number }, ipHash: actor.ipHash,
    })

    return added.number
  }, pool)
}
