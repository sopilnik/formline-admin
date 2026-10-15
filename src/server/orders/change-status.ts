import 'server-only'
import type { Pool } from 'pg'
import type { OrderStatus } from '@/lib/orders/status'
import type { Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { changeOrderStatus } from '@/server/dal/orders'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

/** Order numbers, newest first. */
export type StatusOutcome = { changed: number[]; skipped: number[] }

const newestFirst = (a: number, b: number): number => b - a

/**
 * One status for one or many orders: every order the machine allows moves,
 * each with its event and an activity entry; the others are reported by number. The ids
 * are walked in sorted order in one transaction, so two overlapping changes lock their
 * rows in the same order. An id the workspace does not hold is neither changed nor reported.
 */
export async function changeStatuses(
  actor: Actor,
  { orderIds, to }: { orderIds: readonly string[]; to: OrderStatus },
  pool: Pool = getPool(),
): Promise<StatusOutcome> {
  const ids = [...new Set(orderIds)].sort()

  return withWorkspace(workspaceContext(actor), async tx => {
    const changed: number[] = []
    const skipped: number[] = []

    for (const orderId of ids) {
      const result = await changeOrderStatus(tx, { workspaceId: actor.workspaceId, userId: actor.userId }, { orderId, to })

      if (result.ok) {
        changed.push(result.number)
        await logActivity(tx, actor.workspaceId, {
          actorUserId: actor.userId,
          action: 'order.status_changed',
          entityType: 'order',
          entityId: orderId,
          details: { number: result.number, from: result.from, to: result.to, bulk: ids.length > 1 },
          ipHash: actor.ipHash,
        })
      } else if (result.reason === 'invalid_transition') {
        skipped.push(result.number)
      }
    }

    return { changed: changed.sort(newestFirst), skipped: skipped.sort(newestFirst) }
  }, pool)
}
