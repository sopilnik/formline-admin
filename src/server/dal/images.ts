import 'server-only'
import { and, eq } from 'drizzle-orm'
import { images, pendingMediaDeletions, products } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

/**
 * Removes an image row that no product uses any more; call it after the product
 * row was deleted or pointed elsewhere. An upload's stored file is queued in
 * `pending_media_deletions`, which the daily job drains; a template poster ships with the
 * app under `public/`, so only its row goes. Returns the queued path, or null.
 */
export async function releaseImage(tx: Tx, workspaceId: string, imageId: string): Promise<string | null> {
  const [user] = await tx.select({ id: products.id }).from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.imageId, imageId))).limit(1)

  if (user) return null

  const [image] = await tx.delete(images).where(and(eq(images.workspaceId, workspaceId), eq(images.id, imageId)))
    .returning({ storagePath: images.storagePath, source: images.source })

  if (!image || image.source !== 'upload') return null
  await tx.insert(pendingMediaDeletions).values({ storagePath: image.storagePath }).onConflictDoNothing()

  return image.storagePath
}

/** An uploaded image of the workspace; null for another workspace's image or a template poster, which `/posters/` serves. */
export async function getUpload(tx: Tx, workspaceId: string, imageId: string): Promise<{ storagePath: string; bytes: number } | null> {
  const [image] = await tx.select({ storagePath: images.storagePath, bytes: images.bytes }).from(images)
    .where(and(eq(images.workspaceId, workspaceId), eq(images.id, imageId), eq(images.source, 'upload')))

  return image ?? null
}
