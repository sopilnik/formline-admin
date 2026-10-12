import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/server/actor'
import { log } from '@/server/log'
import type { Processed } from '@/server/media/image'
import { mediaPath, thumbPath } from '@/server/media/storage'
import { MEDIA_CAP, removeProductImage, storeProductImage } from '@/server/media/upload'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'
import { memoryStorage } from './storage'

let admin: pg.Pool
let app: pg.Pool
const workspaces: string[] = []

async function sandbox(): Promise<Actor> {
  const { workspaceId, userId } = await createSandbox(app)
  workspaces.push(workspaceId)
  return { workspaceId, userId, role: 'owner', ipHash: null }
}

beforeAll(() => {
  admin = adminPool()
  app = appPool()
})
afterAll(async () => {
  // The deletion queue is global: housekeeping.test.ts drains it and counts what it finds.
  await admin.query("delete from fa.pending_media_deletions where split_part(storage_path, '/', 2) = any($1::text[])", [workspaces])
  await closeAll()
})

const webp = (size = 1000): Processed => ({ bytes: Buffer.alloc(size, 7), width: 720, height: 1018, thumb: Buffer.alloc(100, 3) })

const productOf = async (actor: Actor, slug: string) => (await admin.query<{ id: string; image_id: string | null }>(
  'select id, image_id from fa.products where workspace_id = $1 and slug = $2', [actor.workspaceId, slug])).rows[0]!

const imageRow = async (actor: Actor, id: string) => (await admin.query<{ storage_path: string; source: string; width: number; bytes: number }>(
  'select storage_path, source, width, bytes from fa.images where workspace_id = $1 and id = $2', [actor.workspaceId, id])).rows[0]

const queued = async (path: string) => (await admin.query('select 1 from fa.pending_media_deletions where storage_path = $1', [path])).rowCount

describe('storeProductImage', () => {
  it('stores the file, points the product at it, drops the poster row without queueing it, and logs', async () => {
    const owner = await sandbox()
    const storage = memoryStorage()
    const product = await productOf(owner, 'hush')
    const poster = await imageRow(owner, product.image_id!)
    const result = await storeProductImage(owner, product.id, webp(), storage, app)
    expect(result).toMatchObject({ ok: true, width: 720, height: 1018 })
    if (!result.ok) return
    const path = mediaPath(owner.workspaceId, result.imageId)
    expect(storage.files.get(path)?.length).toBe(1000)
    expect(storage.files.get(thumbPath(path))?.length).toBe(100)
    expect((await productOf(owner, 'hush')).image_id).toBe(result.imageId)
    expect(await imageRow(owner, result.imageId)).toEqual({ storage_path: path, source: 'upload', width: 720, bytes: 1000 })
    expect(await imageRow(owner, product.image_id!)).toBeUndefined()
    expect(await queued(poster!.storage_path)).toBe(0)
    const log = await admin.query<{ action: string }>('select action from fa.activity_log where workspace_id = $1 and entity_id = $2', [owner.workspaceId, product.id])
    expect(log.rows.map(r => r.action)).toEqual(['product.image_changed'])
  })

  it('queues the upload it replaces, and the one removed', async () => {
    const owner = await sandbox()
    const storage = memoryStorage()
    const product = await productOf(owner, 'loud')
    const first = await storeProductImage(owner, product.id, webp(), storage, app)
    const second = await storeProductImage(owner, product.id, webp(), storage, app)
    if (!first.ok || !second.ok) throw new Error('upload refused')
    expect(await queued(mediaPath(owner.workspaceId, first.imageId))).toBe(1)
    expect(await removeProductImage(owner, product.id, app)).toEqual({ ok: true })
    expect((await productOf(owner, 'loud')).image_id).toBeNull()
    expect(await queued(mediaPath(owner.workspaceId, second.imageId))).toBe(1)
    expect(await removeProductImage(owner, product.id, app)).toEqual({ ok: true })
  })

  it('refuses a product of another workspace and takes its file back out of storage', async () => {
    const owner = await sandbox()
    const other = await sandbox()
    // Sandboxes share the template's ids, so the other workspace gets a product of its own.
    const theirs = (await admin.query<{ id: string }>(
      "insert into fa.products (workspace_id, slug, name, collection_id, base_price_cents, status) select $1, 'theirs', 'Theirs', id, 1000, 'draft' from fa.collections where workspace_id = $1 limit 1 returning id",
      [other.workspaceId])).rows[0]!
    const storage = memoryStorage()
    expect(await storeProductImage(owner, theirs.id, webp(), storage, app)).toEqual({ ok: false, reason: 'not_found' })
    expect(storage.files.size).toBe(0)
  })

  it('takes the image back out of storage when storage refuses its small copy, and a failed cleanup never hides why', async () => {
    const owner = await sandbox()
    const product = await productOf(owner, 'hush')
    const storage = memoryStorage()
    const put = storage.put.bind(storage)
    storage.put = async (path, bytes) => {
      if (path.endsWith('.thumb.webp')) throw new Error(`refused: ${path}`)
      await put(path, bytes)
    }
    await expect(storeProductImage(owner, product.id, webp(), storage, app)).rejects.toThrow('refused')
    expect(storage.files.size).toBe(0)

    // Storage refuses the cleanup as well, and the database refuses to queue it: the error is still the small copy's.
    storage.delete = async path => { throw new Error(`cannot delete ${path}`) }
    const refusing = new Proxy(app, {
      get(target, key, receiver) {
        if (key !== 'query') return Reflect.get(target, key, receiver)
        return (text: unknown, ...rest: unknown[]) => String(text).includes('pending_media_deletions')
          ? Promise.reject(new Error('queue refused'))
          : (target.query as (...args: unknown[]) => Promise<unknown>).call(target, text, ...rest)
      },
    })
    const warn = vi.spyOn(log, 'warn')
    const error = vi.spyOn(log, 'error')
    try {
      await expect(storeProductImage(owner, product.id, webp(), storage, refusing)).rejects.toThrow(/refused: .*\.thumb\.webp/)
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'media.discard_failed' }))
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ event: 'media.discard_unqueued' }))
    } finally {
      warn.mockRestore()
      error.mockRestore()
    }
  })

  it('keeps each workspace within 30 uploads and 20 MB, not counting the image being replaced', async () => {
    const owner = await sandbox()
    const storage = memoryStorage()
    const products = (await admin.query<{ id: string }>('select id from fa.products where workspace_id = $1 order by slug', [owner.workspaceId])).rows
    await admin.query(
      `insert into fa.images (workspace_id, id, storage_path, source, width, height, bytes)
       select $1::uuid, gen_random_uuid(), 'ws/' || $1::text || '/' || gen_random_uuid() || '.webp', 'upload', 10, 10, 1000 from generate_series(1, $2::int)`,
      [owner.workspaceId, MEDIA_CAP.images - 1])
    const last = await storeProductImage(owner, products[0]!.id, webp(), storage, app)
    expect(last.ok).toBe(true)
    expect(await storeProductImage(owner, products[1]!.id, webp(), storage, app)).toEqual({ ok: false, reason: 'cap' })
    expect(await storeProductImage(owner, products[0]!.id, webp(), storage, app)).toMatchObject({ ok: true })
    const heavy = await sandbox()
    const big = (await productOf(heavy, 'hush')).id
    expect(await storeProductImage(heavy, big, webp(MEDIA_CAP.bytes + 1), storage, app)).toEqual({ ok: false, reason: 'cap' })
    // The cap holds the sum: 500 bytes short of it, a 1000-byte upload crosses it and a 400-byte one fits.
    await admin.query(
      `insert into fa.images (workspace_id, id, storage_path, source, width, height, bytes)
       values ($1::uuid, gen_random_uuid(), 'ws/' || $1::text || '/' || gen_random_uuid() || '.webp', 'upload', 10, 10, $2)`,
      [heavy.workspaceId, MEDIA_CAP.bytes - 500])
    expect(await storeProductImage(heavy, big, webp(1000), storage, app)).toEqual({ ok: false, reason: 'cap' })
    expect(await storeProductImage(heavy, big, webp(400), storage, app)).toMatchObject({ ok: true })
    // Three uploads went through, each with its small copy.
    expect(storage.files.size).toBe(6)
  })

  it('finds nothing to change for a viewer', async () => {
    const owner = await sandbox()
    const viewerId = (await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])).rows[0]!.id
    const storage = memoryStorage()
    const product = await productOf(owner, 'hush')
    await expect(storeProductImage({ ...owner, userId: viewerId, role: 'viewer' }, product.id, webp(), storage, app)).resolves.toEqual({ ok: false, reason: 'not_found' })
    expect(storage.files.size).toBe(0)
  })
})
