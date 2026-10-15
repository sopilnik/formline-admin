import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/actor'
import { getProduct } from '@/server/dal/products'
import { withWorkspace } from '@/server/db/with-workspace'
import { createProductWithLog } from '@/server/products/create'
import { changeProductStatusWithLog, deleteProductWithLog } from '@/server/products/status'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: Actor
let collectionId: string

beforeAll(async () => {
  admin = adminPool()
  app = appPool()

  const { workspaceId, userId } = await createSandbox(app)

  owner = { workspaceId, userId, role: 'owner', ipHash: null }
  collectionId = (await admin.query<{ id: string }>("select id from fa.collections where workspace_id = $1 and slug = 'night'", [owner.workspaceId])).rows[0]!.id
})
afterAll(async () => {
  // The deletion queue is global: housekeeping.test.ts drains it and counts what it finds.
  await admin.query("delete from fa.pending_media_deletions where storage_path like 'ws/' || $1 || '/%'", [owner.workspaceId])
  await closeAll()
})

const read = (slug: string) => withWorkspace(owner, tx => getProduct(tx, owner.workspaceId, slug), app)
const idOf = async (slug: string) => (await read(slug))!.id

const newDraft = async (slug: string) => {
  const result = await createProductWithLog(owner, { name: slug, slug, collectionId, basePriceCents: 2500, tags: [], description: '', palettes: ['ink'] }, app)

  if (!result.ok) throw new Error(result.reason)

  return result.id
}

const actions = async (entityId: string) => (await admin.query<{ action: string; details: Record<string, unknown> }>(
  'select action, details from fa.activity_log where workspace_id = $1 and entity_id = $2 order by at, id', [owner.workspaceId, entityId])).rows

describe('changeProductStatusWithLog', () => {
  it('walks the machine, bumps the version and logs each step', async () => {
    const id = await idOf('after-dark')
    const version = (await read('after-dark'))!.version

    expect(await changeProductStatusWithLog(owner, id, 'archived', app)).toEqual({ ok: true, slug: 'after-dark', from: 'published', to: 'archived' })
    expect(await changeProductStatusWithLog(owner, id, 'published', app)).toEqual({ ok: false, reason: 'invalid_transition', from: 'archived' })
    expect(await changeProductStatusWithLog(owner, id, 'draft', app)).toMatchObject({ ok: true, to: 'draft' })

    const after = (await read('after-dark'))!

    expect(after.status).toBe('draft')
    expect(after.version).not.toBe(version)
    expect(await actions(id)).toEqual([
      { action: 'product.status_changed', details: { slug: 'after-dark', from: 'published', to: 'archived' } },
      { action: 'product.status_changed', details: { slug: 'after-dark', from: 'archived', to: 'draft' } },
    ])
  })

  it('finds nothing to change for a viewer', async () => {
    const viewerId = (await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])).rows[0]!.id

    expect(await changeProductStatusWithLog({ ...owner, userId: viewerId, role: 'viewer' }, await idOf('hush'), 'archived', app)).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('deleteProductWithLog', () => {
  it('keeps a product that has orders or is not a draft', async () => {
    expect(await deleteProductWithLog(owner, await idOf('after-dark'), app)).toEqual({ ok: false, reason: 'has_orders' })
    expect(await deleteProductWithLog(owner, await idOf('far-orbit'), app)).toEqual({ ok: false, reason: 'has_orders' })

    const published = await newDraft('never-sold')

    await changeProductStatusWithLog(owner, published, 'published', app)
    expect(await deleteProductWithLog(owner, published, app)).toEqual({ ok: false, reason: 'not_draft' })
    expect(await read('after-dark')).not.toBeNull()
    expect(await read('never-sold')).not.toBeNull()
  })

  it('deletes a draft with its variants, queues an uploaded image and logs the name', async () => {
    const id = await newDraft('short-lived')
    const imageId = randomUUID()
    const path = `ws/${owner.workspaceId}/${imageId}.webp`

    await admin.query("insert into fa.images (workspace_id, id, storage_path, source, width, height, bytes) values ($1, $2, $3, 'upload', 10, 14, 100)", [owner.workspaceId, imageId, path])
    await admin.query('update fa.products set image_id = $3 where workspace_id = $1 and id = $2', [owner.workspaceId, id, imageId])
    expect(await deleteProductWithLog(owner, id, app)).toEqual({ ok: true, slug: 'short-lived', name: 'short-lived', variants: 3, queued: path })
    expect(await read('short-lived')).toBeNull()

    const left = await admin.query('select 1 from fa.product_variants where workspace_id = $1 and product_id = $2 union all select 1 from fa.images where workspace_id = $1 and id = $3', [owner.workspaceId, id, imageId])

    expect(left.rowCount).toBe(0)
    expect((await admin.query('select 1 from fa.pending_media_deletions where storage_path = $1', [path])).rowCount).toBe(1)
    expect((await actions(id)).map(a => a.action)).toEqual(['product.created', 'product.deleted'])
  })

  it('keeps an image another product still uses, and never queues a template poster', async () => {
    const id = await newDraft('poster-borrower')
    const poster = (await admin.query<{ id: string; storage_path: string }>("select id, storage_path from fa.images where workspace_id = $1 and storage_path = 'posters/hush.webp'", [owner.workspaceId])).rows[0]!

    await admin.query('update fa.products set image_id = $3 where workspace_id = $1 and id = $2', [owner.workspaceId, id, poster.id])
    expect(await deleteProductWithLog(owner, id, app)).toMatchObject({ ok: true, queued: null })
    expect((await read('hush'))!.image?.id).toBe(poster.id)

    const orphan = await newDraft('poster-owner')

    await admin.query("update fa.products set image_id = null where workspace_id = $1 and slug = 'hush'", [owner.workspaceId])
    await admin.query('update fa.products set image_id = $3 where workspace_id = $1 and id = $2', [owner.workspaceId, orphan, poster.id])
    expect(await deleteProductWithLog(owner, orphan, app)).toMatchObject({ ok: true, queued: null })
    expect((await admin.query('select 1 from fa.images where workspace_id = $1 and id = $2', [owner.workspaceId, poster.id])).rowCount).toBe(0)
    expect((await admin.query('select 1 from fa.pending_media_deletions where storage_path = $1', [poster.storage_path])).rowCount).toBe(0)
  })
})
