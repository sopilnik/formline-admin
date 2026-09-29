import 'server-only'
import type { Pool } from 'pg'
import { actorContext, type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { createProduct, type NewProductInput, type ProductCreation } from '@/server/dal/products'
import { getStoreSettings } from '@/server/dal/settings'
import { getPool } from '@/server/db/pool'
import { withWorkspace } from '@/server/db/with-workspace'

/** Creates the draft with the store's low-stock threshold on every variant and logs it (`product.created`). */
export async function createProductWithLog(actor: Actor, input: Omit<NewProductInput, 'lowStockThreshold'>, pool: Pool = getPool()): Promise<ProductCreation> {
  return withWorkspace(actorContext(actor), async tx => {
    const { lowStockDefault } = await getStoreSettings(tx, actor.workspaceId)
    const result = await createProduct(tx, actor.workspaceId, { ...input, lowStockThreshold: lowStockDefault })
    if (result.ok) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'product.created', entityType: 'product', entityId: result.id,
        details: { slug: result.slug, variants: result.variants }, ipHash: actor.ipHash,
      })
    }
    return result
  }, pool)
}
