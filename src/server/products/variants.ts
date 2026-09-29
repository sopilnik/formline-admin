import 'server-only'
import type { Pool } from 'pg'
import { actorContext, type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { saveVariants, type VariantRowInput, type VariantsSave } from '@/server/dal/products'
import { getPool } from '@/server/db/pool'
import { withWorkspace } from '@/server/db/with-workspace'

/** Saves the variant form and logs every changed variant with its before and after (`product.variants_updated`). */
export async function saveVariantsWithLog(actor: Actor, productId: string, rows: readonly VariantRowInput[], pool: Pool = getPool()): Promise<VariantsSave> {
  return withWorkspace(actorContext(actor), async tx => {
    const result = await saveVariants(tx, actor.workspaceId, productId, rows)
    if (result.ok && result.changes.length > 0) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'product.variants_updated', entityType: 'product', entityId: productId,
        details: { slug: result.slug, variants: result.changes }, ipHash: actor.ipHash,
      })
    }
    return result
  }, pool)
}
