import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateToken, hashToken } from '@/server/auth/tokens'
import type { Actor } from '@/server/actor'
import { getProduct, PRODUCT_CAP } from '@/server/dal/products'
import { withWorkspace } from '@/server/db/with-workspace'
import { createProductWithLog } from '@/server/products/create'
import { adminPool, appPool, closeAll } from './db'
import { errorText } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: Actor
let pastel: string

async function sandbox(): Promise<Actor> {
  const { rows } = await app.query<{ outcome: string; sandbox_id: string; demo_user_id: string }>(
    'select outcome, sandbox_id, demo_user_id from fa.create_sandbox($1, $2, $3, $4)',
    [createHash('sha256').update(randomUUID()).digest('hex'), hashToken(generateToken()), 'Vitest', 'en'])
  expect(rows[0]?.outcome).toBe('created')
  return { workspaceId: rows[0]!.sandbox_id, userId: rows[0]!.demo_user_id, role: 'owner', ipHash: null }
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  owner = await sandbox()
  pastel = (await admin.query<{ id: string }>("select id from fa.collections where workspace_id = $1 and slug = 'pastel'", [owner.workspaceId])).rows[0]!.id
})
afterAll(closeAll)

const draft = (slug: string, palettes = ['sage', 'sand']) => ({
  name: 'Tide Pool', slug, collectionId: pastel, basePriceCents: 2700, tags: ['calm'], description: 'Shallow water, soft light.', palettes,
})

describe('createProductWithLog', () => {
  it('creates a draft with one empty variant per size and palette, at the store threshold, and logs it', async () => {
    await admin.query('update fa.store_settings set low_stock_default = 5 where workspace_id = $1', [owner.workspaceId])
    const result = await createProductWithLog(owner, draft('tide-pool'), app)
    expect(result).toMatchObject({ ok: true, slug: 'tide-pool', variants: 6 })
    const product = (await withWorkspace(owner, tx => getProduct(tx, owner.workspaceId, 'tide-pool'), app))!
    expect(product.status).toBe('draft')
    expect(product.image).toBeNull()
    expect(product.hasOrders).toBe(false)
    expect(product.variants.map(v => [v.sku, v.stock, v.lowStockThreshold, v.priceCents])).toEqual([
      ['tide-pool-a3-sage', 0, 5, 2700], ['tide-pool-a2-sage', 0, 5, 4300], ['tide-pool-a1-sage', 0, 5, 6700],
      ['tide-pool-a3-sand', 0, 5, 2700], ['tide-pool-a2-sand', 0, 5, 4300], ['tide-pool-a1-sand', 0, 5, 6700],
    ])
    const log = await admin.query<{ action: string; details: unknown }>('select action, details from fa.activity_log where workspace_id = $1 and entity_id = $2', [owner.workspaceId, product.id])
    expect(log.rows).toEqual([{ action: 'product.created', details: { slug: 'tide-pool', variants: 6 } }])
  })

  it('refuses a slug in use and SKUs another product kept from its old slug', async () => {
    expect(await createProductWithLog(owner, draft('far-orbit'), app)).toEqual({ ok: false, reason: 'slug_taken' })
    await admin.query("update fa.products set slug = 'slow-days' where workspace_id = $1 and slug = 'slow'", [owner.workspaceId])
    expect(await createProductWithLog(owner, draft('slow', ['sage']), app)).toEqual({ ok: false, reason: 'sku_taken' })
    expect(await createProductWithLog(owner, draft('slow', ['ink']), app)).toMatchObject({ ok: true, slug: 'slow' })
  })

  it('refuses a collection the workspace lacks and stops at the product cap', async () => {
    expect(await createProductWithLog(owner, { ...draft('nowhere'), collectionId: randomUUID() }, app)).toEqual({ ok: false, reason: 'collection_missing' })
    const full = await sandbox()
    const collection = (await admin.query<{ id: string }>('select id from fa.collections where workspace_id = $1 limit 1', [full.workspaceId])).rows[0]!.id
    await admin.query(
      `insert into fa.products (workspace_id, slug, name, collection_id, base_price_cents, status)
       select $1, 'filler-' || n, 'Filler ' || n, $2, 1000, 'draft' from generate_series(1, $3::int) n`,
      [full.workspaceId, collection, PRODUCT_CAP - 16])
    expect(await createProductWithLog(full, { ...draft('one-more'), collectionId: collection }, app)).toEqual({ ok: false, reason: 'cap' })
  })

  it('leaves the database to refuse a viewer', async () => {
    const viewerId = (await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])).rows[0]!.id
    const error = await createProductWithLog({ ...owner, userId: viewerId, role: 'viewer' }, draft('viewer-made'), app).catch((e: unknown) => e)
    expect(errorText(error)).toMatch(/row-level security/)
  })
})
