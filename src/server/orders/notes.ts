import 'server-only'
import type { Pool } from 'pg'
import { logActivity } from '@/server/dal/activity'
import { addOrderNote } from '@/server/dal/orders'
import { getPool } from '@/server/db/pool'
import { withWorkspace } from '@/server/db/with-workspace'
import type { StatusActor } from '@/server/orders/change-status'

/** Adds an internal note and logs it (amendment 8); the order's number, or null when there is no such order. */
export async function addNote(actor: StatusActor, orderId: string, note: string, pool: Pool = getPool()): Promise<number | null> {
  return withWorkspace({ workspaceId: actor.workspaceId, userId: actor.userId, role: actor.role }, async tx => {
    const added = await addOrderNote(tx, { workspaceId: actor.workspaceId, userId: actor.userId }, { orderId, note })
    if (!added) return null
    await logActivity(tx, actor.workspaceId, {
      actorUserId: actor.userId, action: 'order.note_added', entityType: 'order', entityId: orderId, details: { number: added.number }, ipHash: actor.ipHash,
    })
    return added.number
  }, pool)
}
