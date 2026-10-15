import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/actor'
import { getProduct, type VariantRowInput } from '@/server/dal/products'
import { withWorkspace } from '@/server/db/with-workspace'
import { saveVariantsWithLog } from '@/server/products/variants'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: Actor

beforeAll(async () => {
  admin = adminPool()
  app = appPool()

  const { workspaceId, userId } = await createSandbox(app)

  owner = { workspaceId, userId, role: 'owner', ipHash: null }
})
afterAll(closeAll)

const read = async (slug: string) => (await withWorkspace(owner, tx => getProduct(tx, owner.workspaceId, slug), app))!

/** The form as the page would send it: every variant as loaded, with `edit` applied to the chosen SKUs. */
async function formFor(slug: string, edit: Record<string, Partial<VariantRowInput>> = {}) {
  const product = await read(slug)
  const rows: VariantRowInput[] = product.variants.map(v => ({
    id: v.id, priceOverrideCents: v.priceOverrideCents, stock: v.stock, stockWas: v.stock, lowStockThreshold: v.lowStockThreshold, ...edit[v.sku],
  }))

  return { product, rows }
}

const setStock = (sku: string, stock: number) => admin.query('update fa.product_variants set stock = $3 where workspace_id = $1 and sku = $2', [owner.workspaceId, sku, stock])

describe('saveVariantsWithLog', () => {
  it('saves own prices, stock and thresholds and logs each change with its before and after', async () => {
    const { product, rows } = await formFor('far-orbit', {
      'far-orbit-a1-ink': { priceOverrideCents: 6500, lowStockThreshold: 5 },
      'far-orbit-a3-ocean': { stock: 40 },
    })
    const before = product.variants.find(v => v.sku === 'far-orbit-a3-ocean')!.stock
    const result = await saveVariantsWithLog(owner, product.id, rows, app)

    expect(result).toEqual({
      ok: true, slug: 'far-orbit',
      changes: [
        { sku: 'far-orbit-a1-ink', price: [null, 6500], threshold: [3, 5] },
        { sku: 'far-orbit-a3-ocean', stock: [before, 40] },
      ],
    })

    const after = await read('far-orbit')

    expect(after.variants.find(v => v.sku === 'far-orbit-a1-ink')).toMatchObject({ priceCents: 6500, priceOverrideCents: 6500, lowStockThreshold: 5 })
    expect(after.variants.find(v => v.sku === 'far-orbit-a3-ocean')?.stock).toBe(40)

    const log = await admin.query<{ action: string; details: { variants: unknown[] } }>(
      "select action, details from fa.activity_log where workspace_id = $1 and action = 'product.variants_updated'", [owner.workspaceId])

    expect(log.rows).toEqual([{ action: 'product.variants_updated', details: { slug: 'far-orbit', variants: result.ok ? result.changes : [] } }])
  })

  it('goes back to the computed price when the own price is emptied', async () => {
    const { product, rows } = await formFor('far-orbit', { 'far-orbit-a1-ink': { priceOverrideCents: null } })

    expect(await saveVariantsWithLog(owner, product.id, rows, app)).toMatchObject({ ok: true, changes: [{ sku: 'far-orbit-a1-ink', price: [6500, null] }] })
    expect((await read('far-orbit')).variants.find(v => v.sku === 'far-orbit-a1-ink')?.priceCents).toBe(7100)
  })

  it('keeps a sale made meanwhile when the stock field was left alone', async () => {
    const { product, rows } = await formFor('hush', { 'hush-a3-ink': { lowStockThreshold: 2 } })

    await setStock('hush-a2-ink', 1)

    const result = await saveVariantsWithLog(owner, product.id, rows, app)

    expect(result).toEqual({ ok: true, slug: 'hush', changes: [{ sku: 'hush-a3-ink', threshold: [3, 2] }] })
    expect((await read('hush')).variants.find(v => v.sku === 'hush-a2-ink')?.stock).toBe(1)
  })

  it('writes nothing when a changed stock had moved on meanwhile', async () => {
    const { product, rows } = await formFor('loud', { 'loud-a3-signal': { stock: 30 }, 'loud-a1-ocean': { lowStockThreshold: 9 } })

    await setStock('loud-a3-signal', 7)
    expect(await saveVariantsWithLog(owner, product.id, rows, app)).toEqual({ ok: false, reason: 'stock_conflict', skus: ['loud-a3-signal'] })

    const after = await read('loud')

    expect(after.variants.find(v => v.sku === 'loud-a3-signal')?.stock).toBe(7)
    expect(after.variants.find(v => v.sku === 'loud-a1-ocean')?.lowStockThreshold).toBe(3)
  })

  it('refuses a variant of another product and a viewer', async () => {
    const { product, rows } = await formFor('slow')
    const stranger = (await read('sparse')).variants[0]!

    expect(await saveVariantsWithLog(owner, product.id, [...rows, { id: stranger.id, priceOverrideCents: null, stock: 1, stockWas: stranger.stock, lowStockThreshold: 3 }], app))
      .toEqual({ ok: false, reason: 'not_found' })

    const viewerId = (await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])).rows[0]!.id

    expect(await saveVariantsWithLog({ ...owner, userId: viewerId, role: 'viewer' }, product.id, rows, app)).toEqual({ ok: false, reason: 'not_found' })
  })
})
