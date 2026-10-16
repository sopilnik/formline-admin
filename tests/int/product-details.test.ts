import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/actor'
import { getProduct, updateProductDetails, type DetailsInput } from '@/server/dal/products'
import { withWorkspace } from '@/server/db/with-workspace'
import { saveProductDetails } from '@/server/products/details'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, gate, lockWaiter } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: Actor
let viewer: Actor

beforeAll(async () => {
  admin = adminPool()
  app = appPool()

  const { workspaceId, userId } = await createSandbox(app)

  owner = { workspaceId, userId, role: 'owner', ipHash: null }

  const v = await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])

  viewer = { ...owner, userId: v.rows[0]!.id, role: 'viewer' }
})

afterAll(closeAll)

const read = (slug: string) => withWorkspace(owner, tx => getProduct(tx, owner.workspaceId, slug), app)

async function inputFor(slug: string): Promise<DetailsInput> {
  const p = (await read(slug))!

  return { productId: p.id, version: p.version, name: p.name, slug: p.slug, collectionId: p.collection.id, basePriceCents: p.basePriceCents, tags: p.tags, description: p.description }
}

const logged = async (productId: string) => (await admin.query<{ action: string; details: { slug: string; changed: string[] } }>(
  'select action, details from fa.activity_log where workspace_id = $1 and entity_id = $2 order by at', [owner.workspaceId, productId])).rows

describe('getProduct', () => {
  it('reads the product with its collection, image, variants in the store order and whether it has orders', async () => {
    const p = (await read('far-orbit'))!

    expect(p.name).toBe('Far Orbit')
    expect(p.collection.slug).toBe('night')
    expect(p.image?.storagePath).toBe('posters/far-orbit.webp')
    expect(p.variants.map(v => v.sku)).toEqual(['far-orbit-a3-ink', 'far-orbit-a2-ink', 'far-orbit-a1-ink', 'far-orbit-a3-ocean', 'far-orbit-a2-ocean', 'far-orbit-a1-ocean'])
    expect(p.variants.map(v => v.priceCents)).toEqual([3100, 4700, 7100, 3100, 4700, 7100])
    expect(p.hasOrders).toBe(true)
    expect(p.version).toMatch(/^\d+$/)
  })

  it('finds nothing for an unknown slug', async () => {
    expect(await read('no-such-poster')).toBeNull()
  })
})

describe('saveProductDetails', () => {
  it('saves the fields, bumps the version and logs what changed', async () => {
    const input = await inputFor('low-tide')
    const result = await saveProductDetails(owner, { ...input, name: 'Low Tide II', basePriceCents: 3300, tags: ['calm'] }, app)

    expect(result).toEqual({ ok: true, slug: 'low-tide', previousSlug: 'low-tide', changed: ['name', 'basePrice', 'tags'] })

    const after = (await read('low-tide'))!

    expect(after.name).toBe('Low Tide II')
    expect(after.variants[0]!.priceCents).toBe(3300)
    expect(after.version).not.toBe(input.version)
    expect(await logged(input.productId)).toEqual([{ action: 'product.updated', details: { slug: 'low-tide', changed: ['name', 'basePrice', 'tags'] } }])
  })

  it('moves the product to a new slug', async () => {
    const input = await inputFor('sparse')

    expect(await saveProductDetails(owner, { ...input, slug: 'sparse-grid' }, app)).toMatchObject({ ok: true, slug: 'sparse-grid', previousSlug: 'sparse' })
    expect(await read('sparse')).toBeNull()
    expect((await read('sparse-grid'))?.id).toBe(input.productId)
  })

  it('reports a conflict instead of overwriting a newer change', async () => {
    const input = await inputFor('hush')

    await admin.query("update fa.products set description = 'Changed elsewhere.', updated_at = now() where workspace_id = $1 and id = $2", [owner.workspaceId, input.productId])

    expect(await saveProductDetails(owner, { ...input, name: 'Hush Hush' }, app)).toEqual({ ok: false, reason: 'conflict' })
    expect((await read('hush'))?.name).toBe('Hush')
  })

  it('refuses a slug another product has and a collection the workspace lacks', async () => {
    const input = await inputFor('loud')

    expect(await saveProductDetails(owner, { ...input, slug: 'red-corner' }, app)).toEqual({ ok: false, reason: 'slug_taken' })
    expect(await saveProductDetails(owner, { ...input, collectionId: randomUUID() }, app)).toEqual({ ok: false, reason: 'collection_missing' })
  })

  it('refuses the slug a concurrent save took after the check, instead of failing', async () => {
    const changed = gate()
    const done = gate()
    const first = withWorkspace(owner, async tx => {
      const made = await updateProductDetails(tx, owner.workspaceId, { ...(await inputFor('after-dark')), slug: 'midnight' })

      changed.open()
      await done.wait

      return made
    }, app)

    await changed.wait

    const second = saveProductDetails(owner, { ...(await inputFor('far-orbit')), slug: 'midnight' }, app)

    await Promise.race([lockWaiter(admin), second.catch(() => undefined)])
    done.open()

    expect(await first).toMatchObject({ ok: true, slug: 'midnight' })
    expect(await second).toEqual({ ok: false, reason: 'slug_taken' })
    expect((await read('far-orbit'))?.name).toBe('Far Orbit')
  })

  it('writes nothing when nothing changed', async () => {
    const input = await inputFor('slow')

    expect(await saveProductDetails(owner, input, app)).toEqual({ ok: true, slug: 'slow', previousSlug: 'slow', changed: [] })
    expect((await read('slow'))?.version).toBe(input.version)
    expect(await logged(input.productId)).toEqual([])
  })

  it('finds nothing to change for a viewer', async () => {
    const input = await inputFor('ninety-six')

    expect(await saveProductDetails(viewer, { ...input, name: 'Viewer was here' }, app)).toEqual({ ok: false, reason: 'not_found' })
    expect((await read('ninety-six'))?.name).toBe('Ninety-Six')
  })
})
