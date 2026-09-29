import 'server-only'
import type { Pool } from 'pg'
import { actorContext, type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import {
  createCollection, deleteCollection, moveCollection, updateCollection, type CollectionDeletion, type CollectionMove, type CollectionWrite,
} from '@/server/dal/collections'
import { getPool } from '@/server/db/pool'
import { withWorkspace } from '@/server/db/with-workspace'

type Fields = { name: string; slug: string; description: string }

/** The collection writes with their activity entries (`collection.created`, `.updated`, `.moved`, `.deleted`). */
export async function createCollectionWithLog(actor: Actor, input: Fields, pool: Pool = getPool()): Promise<CollectionWrite> {
  return withWorkspace(actorContext(actor), async tx => {
    const result = await createCollection(tx, actor.workspaceId, input)
    if (result.ok) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'collection.created', entityType: 'collection', entityId: result.id, details: { slug: result.slug }, ipHash: actor.ipHash,
      })
    }
    return result
  }, pool)
}

export async function updateCollectionWithLog(actor: Actor, input: Fields & { id: string }, pool: Pool = getPool()): Promise<CollectionWrite> {
  return withWorkspace(actorContext(actor), async tx => {
    const result = await updateCollection(tx, actor.workspaceId, input)
    if (result.ok) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'collection.updated', entityType: 'collection', entityId: input.id, details: { slug: result.slug }, ipHash: actor.ipHash,
      })
    }
    return result
  }, pool)
}

export async function moveCollectionWithLog(actor: Actor, input: { id: string; direction: 'up' | 'down' }, pool: Pool = getPool()): Promise<CollectionMove> {
  return withWorkspace(actorContext(actor), async tx => {
    const result = await moveCollection(tx, actor.workspaceId, input)
    if (result.ok && result.from !== result.to) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'collection.moved', entityType: 'collection', entityId: input.id,
        details: { slug: result.slug, from: result.from, to: result.to }, ipHash: actor.ipHash,
      })
    }
    return result
  }, pool)
}

export async function deleteCollectionWithLog(actor: Actor, id: string, pool: Pool = getPool()): Promise<CollectionDeletion> {
  return withWorkspace(actorContext(actor), async tx => {
    const result = await deleteCollection(tx, actor.workspaceId, id)
    if (result.ok) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'collection.deleted', entityType: 'collection', entityId: id, details: { slug: result.slug, name: result.name }, ipHash: actor.ipHash,
      })
    }
    return result
  }, pool)
}
