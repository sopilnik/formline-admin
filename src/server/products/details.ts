import 'server-only'
import type { Pool } from 'pg'
import { type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { updateProductDetails, type DetailsChange, type DetailsInput } from '@/server/dal/products'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

/** Saves the details form and logs what changed (`product.updated`); a save that changes nothing is not logged. */
export async function saveProductDetails(actor: Actor, input: DetailsInput, pool: Pool = getPool()): Promise<DetailsChange> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const result = await updateProductDetails(tx, actor.workspaceId, input)
    if (result.ok && result.changed.length > 0) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'product.updated', entityType: 'product', entityId: input.productId,
        details: { slug: result.slug, changed: result.changed }, ipHash: actor.ipHash,
      })
    }
    return result
  }, pool)
}
