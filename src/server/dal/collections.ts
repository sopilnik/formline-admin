import 'server-only'
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm'
import type { ProductStatus } from '@/lib/products/status'
import type { ImageRef } from '@/lib/products/view'
import { lockCap, refuseTaken } from '@/server/dal/concurrency'
import { collections, images, products } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

/** At most this many collections per workspace; the store has four. */
export const COLLECTION_CAP = 50

/** The unique constraint a collection save can break, and the refusal it means. */
const SLUG_TAKEN = { collections_workspace_id_slug_key: 'slug_taken' } as const

export type CollectionRow = { id: string; slug: string; name: string; description: string; position: number; products: number }

/** The collections in their order, each with its number of products; one table per query. */
export async function listCollections(tx: Tx, workspaceId: string): Promise<CollectionRow[]> {
  const rows = await tx.select({ id: collections.id, slug: collections.slug, name: collections.name, description: collections.description, position: collections.position })
    .from(collections).where(eq(collections.workspaceId, workspaceId)).orderBy(asc(collections.position), asc(collections.name))
  const counts = await tx.select({ collectionId: products.collectionId, n: count() }).from(products)
    .where(eq(products.workspaceId, workspaceId)).groupBy(products.collectionId)
  const countOf = new Map(counts.map(c => [c.collectionId, c.n]))
  return rows.map(row => ({ ...row, products: countOf.get(row.id) ?? 0 }))
}

export type CollectionProduct = { id: string; slug: string; name: string; status: ProductStatus; image: ImageRef | null }
export type CollectionDetail = { id: string; slug: string; name: string; description: string; products: CollectionProduct[] }

/** One collection by its slug, with its products by name. */
export async function getCollection(tx: Tx, workspaceId: string, slug: string): Promise<CollectionDetail | null> {
  const [row] = await tx.select({ id: collections.id, slug: collections.slug, name: collections.name, description: collections.description })
    .from(collections).where(and(eq(collections.workspaceId, workspaceId), eq(collections.slug, slug)))
  if (!row) return null
  const members = await tx.select({ id: products.id, slug: products.slug, name: products.name, status: products.status, imageId: products.imageId })
    .from(products).where(and(eq(products.workspaceId, workspaceId), eq(products.collectionId, row.id))).orderBy(asc(products.name), asc(products.id))
  const imageIds = members.flatMap(m => (m.imageId ? [m.imageId] : []))
  const imageRows = imageIds.length === 0 ? [] : await tx.select({ id: images.id, storagePath: images.storagePath, source: images.source })
    .from(images).where(and(eq(images.workspaceId, workspaceId), inArray(images.id, imageIds)))
  const imageOf = new Map(imageRows.map(i => [i.id, i]))
  return {
    ...row,
    products: members.map(m => ({ id: m.id, slug: m.slug, name: m.name, status: m.status, image: m.imageId ? (imageOf.get(m.imageId) ?? null) : null })),
  }
}

export type CollectionWrite = { ok: true; id: string; slug: string; previousSlug: string } | { ok: false; reason: 'not_found' | 'slug_taken' | 'cap' }

/** A new collection at the end of the order. */
export async function createCollection(tx: Tx, workspaceId: string, input: { name: string; slug: string; description: string }): Promise<CollectionWrite> {
  await lockCap(tx, workspaceId, 'collections')
  const all = await tx.select({ slug: collections.slug, position: collections.position }).from(collections).where(eq(collections.workspaceId, workspaceId))
  if (all.length >= COLLECTION_CAP) return { ok: false, reason: 'cap' }
  if (all.some(c => c.slug === input.slug)) return { ok: false, reason: 'slug_taken' }

  return refuseTaken(tx, SLUG_TAKEN, async () => {
    const [created] = await tx.insert(collections).values({
      workspaceId, slug: input.slug, name: input.name, description: input.description, position: Math.max(0, ...all.map(c => c.position)) + 1,
    }).returning({ id: collections.id })
    return { ok: true as const, id: created!.id, slug: input.slug, previousSlug: input.slug }
  })
}

/** Saves a collection's fields. Collections carry no version, so the last save wins; their slugs are unique. */
export async function updateCollection(tx: Tx, workspaceId: string, input: { id: string; name: string; slug: string; description: string }): Promise<CollectionWrite> {
  const [row] = await tx.select({ slug: collections.slug }).from(collections)
    .where(and(eq(collections.workspaceId, workspaceId), eq(collections.id, input.id))).for('update')
  if (!row) return { ok: false, reason: 'not_found' }
  const [other] = await tx.select({ id: collections.id }).from(collections)
    .where(and(eq(collections.workspaceId, workspaceId), eq(collections.slug, input.slug), ne(collections.id, input.id)))
  if (other) return { ok: false, reason: 'slug_taken' }

  return refuseTaken(tx, SLUG_TAKEN, async () => {
    await tx.update(collections).set({ name: input.name, slug: input.slug, description: input.description })
      .where(and(eq(collections.workspaceId, workspaceId), eq(collections.id, input.id)))
    return { ok: true as const, id: input.id, slug: input.slug, previousSlug: row.slug }
  })
}

/** The workspace's collections in their current order, locked until the transaction ends. */
async function lockedOrder(tx: Tx, workspaceId: string): Promise<{ id: string; slug: string; name: string }[]> {
  return tx.select({ id: collections.id, slug: collections.slug, name: collections.name }).from(collections)
    .where(eq(collections.workspaceId, workspaceId)).orderBy(asc(collections.position), asc(collections.name), asc(collections.id)).for('update')
}

/** Renumbers the order 1, 2, 3… after a move or a deletion, from rows `lockedOrder` locked first. */
async function renumber(tx: Tx, workspaceId: string, ids: readonly string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await tx.update(collections).set({ position: index + 1 }).where(and(eq(collections.workspaceId, workspaceId), eq(collections.id, id)))
  }
}

export type CollectionMove = { ok: true; slug: string; from: number; to: number; of: number } | { ok: false; reason: 'not_found' }

/** Moves a collection one place up or down; at either end it stays where it is. */
export async function moveCollection(tx: Tx, workspaceId: string, input: { id: string; direction: 'up' | 'down' }): Promise<CollectionMove> {
  const order = await lockedOrder(tx, workspaceId)
  const index = order.findIndex(c => c.id === input.id)
  if (index === -1) return { ok: false, reason: 'not_found' }
  const target = input.direction === 'up' ? index - 1 : index + 1
  const ids = order.map(c => c.id)
  if (target >= 0 && target < ids.length) [ids[index], ids[target]] = [ids[target]!, ids[index]!]
  await renumber(tx, workspaceId, ids)
  return { ok: true, slug: order[index]!.slug, from: index + 1, to: ids.indexOf(input.id) + 1, of: ids.length }
}

export type CollectionDeletion = { ok: true; slug: string; name: string } | { ok: false; reason: 'not_found' | 'not_empty' }

/** Deletes an empty collection and closes the gap in the order. */
export async function deleteCollection(tx: Tx, workspaceId: string, id: string): Promise<CollectionDeletion> {
  const order = await lockedOrder(tx, workspaceId)
  const row = order.find(c => c.id === id)
  if (!row) return { ok: false, reason: 'not_found' }
  const [member] = await tx.select({ id: products.id }).from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.collectionId, id))).limit(1)
  if (member) return { ok: false, reason: 'not_empty' }
  await tx.delete(collections).where(and(eq(collections.workspaceId, workspaceId), eq(collections.id, id)))
  await renumber(tx, workspaceId, order.filter(c => c.id !== id).map(c => c.id))
  return { ok: true, slug: row.slug, name: row.name }
}
