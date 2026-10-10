import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import { actorContext, type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { releaseImage } from '@/server/dal/images'
import { getPool } from '@/server/db/pool'
import { images, products } from '@/server/db/schema'
import { withWorkspace, type Tx } from '@/server/db/with-workspace'
import type { Processed } from '@/server/media/image'
import { mediaPath, thumbPath, type MediaStorage } from '@/server/media/storage'

/** Spec §5.4: per workspace at most 30 uploaded images or 20 MB of them. */
export const MEDIA_CAP = { images: 30, bytes: 20 * 1024 * 1024 } as const

export type ImageUpload = { ok: true; imageId: string; width: number; height: number } | { ok: false; reason: 'not_found' | 'cap' }

/** Whether one more upload of `bytes` fits beside the workspace's others; the product's own image does not count, it is replaced. */
async function fits(tx: Tx, workspaceId: string, productImageId: string | null, bytes: number): Promise<boolean> {
  const [used] = await tx.select({ n: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${images.bytes}), 0)::int` }).from(images)
    .where(and(eq(images.workspaceId, workspaceId), eq(images.source, 'upload'), productImageId ? ne(images.id, productImageId) : undefined))
  return (used?.n ?? 0) + 1 <= MEDIA_CAP.images && (used?.bytes ?? 0) + bytes <= MEDIA_CAP.bytes
}

/**
 * Stores a processed upload as the product's image (spec §8.4). The file and its small copy go to
 * storage first, outside any transaction; then the image row, the product's new image and the release of the
 * old one commit together. When the database step refuses or fails, the stored files are removed
 * again, or queued for the daily job if storage refuses that too (the queue takes the copy along).
 */
export async function storeProductImage(actor: Actor, productId: string, image: Processed, storage: MediaStorage, pool: Pool = getPool()): Promise<ImageUpload> {
  const ctx = actorContext(actor)
  const before = await withWorkspace(ctx, async tx => {
    const [product] = await tx.select({ imageId: products.imageId }).from(products)
      .where(and(eq(products.workspaceId, actor.workspaceId), eq(products.id, productId)))
    if (!product) return 'not_found' as const
    return (await fits(tx, actor.workspaceId, product.imageId, image.bytes.length)) ? 'fits' as const : 'cap' as const
  }, pool)
  if (before !== 'fits') return { ok: false, reason: before }

  const imageId = randomUUID()
  const path = mediaPath(actor.workspaceId, imageId)
  await storage.put(path, image.bytes)
  await storage.put(thumbPath(path), image.thumb)
  const discard = async (): Promise<void> => {
    await Promise.all([storage.delete(path), storage.delete(thumbPath(path))])
      .catch(() => pool.query('insert into fa.pending_media_deletions (storage_path) values ($1) on conflict do nothing', [path]))
  }
  try {
    const result = await withWorkspace(ctx, async (tx): Promise<ImageUpload> => {
      const [product] = await tx.select({ slug: products.slug, imageId: products.imageId }).from(products)
        .where(and(eq(products.workspaceId, actor.workspaceId), eq(products.id, productId))).for('update')
      if (!product) return { ok: false, reason: 'not_found' }
      if (!(await fits(tx, actor.workspaceId, product.imageId, image.bytes.length))) return { ok: false, reason: 'cap' }
      await tx.insert(images).values({
        workspaceId: actor.workspaceId, id: imageId, storagePath: path, source: 'upload', width: image.width, height: image.height, bytes: image.bytes.length,
      })
      await tx.update(products).set({ imageId, updatedAt: sql`now()` }).where(and(eq(products.workspaceId, actor.workspaceId), eq(products.id, productId)))
      if (product.imageId) await releaseImage(tx, actor.workspaceId, product.imageId)
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'product.image_changed', entityType: 'product', entityId: productId,
        details: { slug: product.slug, width: image.width, height: image.height, bytes: image.bytes.length }, ipHash: actor.ipHash,
      })
      return { ok: true, imageId, width: image.width, height: image.height }
    }, pool)
    if (!result.ok) await discard()
    return result
  } catch (error) {
    await discard()
    throw error
  }
}

/** "Remove image" (spec §8.4): the product keeps no image; an uploaded file is queued for deletion. */
export async function removeProductImage(actor: Actor, productId: string, pool: Pool = getPool()): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  return withWorkspace(actorContext(actor), async tx => {
    const [product] = await tx.select({ slug: products.slug, imageId: products.imageId }).from(products)
      .where(and(eq(products.workspaceId, actor.workspaceId), eq(products.id, productId))).for('update')
    if (!product) return { ok: false, reason: 'not_found' }
    if (!product.imageId) return { ok: true }
    await tx.update(products).set({ imageId: null, updatedAt: sql`now()` }).where(and(eq(products.workspaceId, actor.workspaceId), eq(products.id, productId)))
    await releaseImage(tx, actor.workspaceId, product.imageId)
    await logActivity(tx, actor.workspaceId, {
      actorUserId: actor.userId, action: 'product.image_removed', entityType: 'product', entityId: productId, details: { slug: product.slug }, ipHash: actor.ipHash,
    })
    return { ok: true }
  }, pool)
}
