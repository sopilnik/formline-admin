import 'server-only'
import type { Pool } from 'pg'
import type { ProductStatus } from '@/lib/products/status'
import { type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { changeProductStatus, deleteProduct, type ProductDeletion, type ProductStatusChange } from '@/server/dal/products'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

/** A status step with its activity entry (`product.status_changed`). */
export async function changeProductStatusWithLog(actor: Actor, productId: string, to: ProductStatus, pool: Pool = getPool()): Promise<ProductStatusChange> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const result = await changeProductStatus(tx, actor.workspaceId, { productId, to })

    if (result.ok) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'product.status_changed', entityType: 'product', entityId: productId,
        details: { slug: result.slug, from: result.from, to: result.to }, ipHash: actor.ipHash,
      })
    }

    return result
  }, pool)
}

/** Deletes a draft without orders and logs it (`product.deleted`), keeping its name for the log. */
export async function deleteProductWithLog(actor: Actor, productId: string, pool: Pool = getPool()): Promise<ProductDeletion> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const result = await deleteProduct(tx, actor.workspaceId, productId)

    if (result.ok) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'product.deleted', entityType: 'product', entityId: productId,
        details: { slug: result.slug, name: result.name, variants: result.variants }, ipHash: actor.ipHash,
      })
    }

    return result
  }, pool)
}
