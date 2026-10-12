import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { variantPriceCents, type SizeId } from '@/lib/products/price'
import { DEFAULT_PRODUCTS_QUERY, type ProductsQuery } from '@/lib/products/query'
import { listProducts } from '@/server/dal/products'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: WorkspaceContext
let viewer: WorkspaceContext

async function sandbox(): Promise<WorkspaceContext> {
  const { workspaceId, userId } = await createSandbox(app)
  return { workspaceId, userId, role: 'owner' }
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  owner = await sandbox()
  const v = await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'viewer'", [owner.workspaceId])
  viewer = { workspaceId: owner.workspaceId, userId: v.rows[0]!.id, role: 'viewer' }
})
afterAll(closeAll)

const list = (query: Partial<ProductsQuery>, ctx = owner) => withWorkspace(ctx, tx => listProducts(tx, ctx.workspaceId, { ...DEFAULT_PRODUCTS_QUERY, ...query }), app)

const slugsWhere = async (where: string, params: unknown[] = [], ws = owner.workspaceId) =>
  (await admin.query<{ slug: string }>(`select p.slug from fa.products p where p.workspace_id = $1 and (${where}) order by p.slug`, [ws, ...params])).rows.map(r => r.slug)

const sorted = (slugs: string[]) => [...slugs].sort()

describe('listProducts', () => {
  it('lists every product by name with its collection, image, price from and stock', async () => {
    const page = await list({})
    const { rows } = await admin.query<{ n: string }>('select count(*) as n from fa.products where workspace_id = $1', [owner.workspaceId])
    expect(page.total).toBe(Number(rows[0]!.n))
    expect(page.filtered).toBe(page.total)
    expect(page.rows).toHaveLength(page.total)
    expect([page.page, page.pages]).toEqual([1, 1])
    const names = page.rows.map(r => r.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })))
    const facts = new Map((await admin.query<{ id: string; collection: string; path: string | null }>(
      `select p.id, c.slug as collection, i.storage_path as path
         from fa.products p
         join fa.collections c on c.workspace_id = p.workspace_id and c.id = p.collection_id
         left join fa.images i on i.workspace_id = p.workspace_id and i.id = p.image_id
        where p.workspace_id = $1`, [owner.workspaceId])).rows.map(r => [r.id, r]))
    const variants = (await admin.query<{ productId: string; base: number; size: SizeId; override: number | null; stock: number }>(
      `select v.product_id as "productId", p.base_price_cents as base, v.size, v.price_override_cents as override, v.stock
         from fa.product_variants v join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id
        where v.workspace_id = $1`, [owner.workspaceId])).rows
    for (const row of page.rows) {
      const own = variants.filter(v => v.productId === row.id)
      expect(row.collection.slug, row.slug).toBe(facts.get(row.id)!.collection)
      expect(row.image?.storagePath ?? null, row.slug).toBe(facts.get(row.id)!.path)
      // The SQL price rule against the one the product forms use.
      expect(row.priceFromCents, row.slug).toBe(Math.min(...own.map(v => variantPriceCents(v.base, v.size, v.override))))
      expect(row.stock, row.slug).toBe(own.reduce((sum, v) => sum + v.stock, 0))
      expect(row.variants, row.slug).toBe(own.length)
    }
    expect(page.collections.map(c => c.slug)).toEqual(['monochrome', 'primary', 'pastel', 'night'])
  })

  it('keeps the products holding sold-out or low variants, as the overview counts them', async () => {
    const out = await list({ stock: 'out' })
    expect(sorted(out.rows.map(r => r.slug))).toEqual(await slugsWhere("p.status <> 'archived' and exists (select 1 from fa.product_variants v where v.workspace_id = p.workspace_id and v.product_id = p.id and v.stock = 0)"))
    expect(out.rows.reduce((n, r) => n + r.soldOut, 0)).toBe(Number((await admin.query<{ n: string }>(
      "select count(*) as n from fa.product_variants v join fa.products p on p.workspace_id = v.workspace_id and p.id = v.product_id where v.workspace_id = $1 and v.stock = 0 and p.status <> 'archived'",
      [owner.workspaceId])).rows[0]!.n))
    const low = await list({ stock: 'low' })
    expect(sorted(low.rows.map(r => r.slug))).toEqual(await slugsWhere("p.status <> 'archived' and exists (select 1 from fa.product_variants v where v.workspace_id = p.workspace_id and v.product_id = p.id and v.stock <= v.low_stock_threshold)"))
    expect(low.filtered).toBeGreaterThanOrEqual(out.filtered)
  })

  it('filters by collection and searches the name', async () => {
    const night = await list({ collection: 'night' })
    expect(sorted(night.rows.map(r => r.slug))).toEqual(await slugsWhere("p.collection_id = (select id from fa.collections c where c.workspace_id = p.workspace_id and c.slug = 'night')"))
    expect((await list({ collection: 'no-such-collection' })).rows).toEqual([])
    const orbit = await list({ q: 'ORBIT' })
    expect(sorted(orbit.rows.map(r => r.slug))).toEqual(await slugsWhere("p.name ilike '%orbit%'"))
    expect((await list({ q: 'nothing like this' })).filtered).toBe(0)
    expect((await list({ q: '100%' })).filtered).toBe(0)
  })

  it('searches Russian names in any case', async () => {
    const ws = await sandbox()
    await admin.query("update fa.products set name = 'Тихая гавань' where workspace_id = $1 and slug = 'hush'", [ws.workspaceId])
    expect((await list({ q: 'ГАВАНЬ' }, ws)).rows.map(r => r.slug)).toEqual(['hush'])
  })

  it('reads one page at a time, in a stable order, and counts the pages', async () => {
    const ws = await sandbox()
    await admin.query(
      `insert into fa.products (workspace_id, slug, name, collection_id, base_price_cents, status)
       select $1, 'paged-' || lpad(n::text, 2, '0'), 'Paged ' || lpad(n::text, 2, '0'),
              (select id from fa.collections where workspace_id = $1 and slug = 'night'), 2900, 'draft'
         from generate_series(1, 30) n`, [ws.workspaceId])
    const first = await list({ q: 'paged' }, ws)
    expect([first.filtered, first.page, first.pages, first.rows.length]).toEqual([30, 1, 2, 25])
    expect(first.rows[0]!.name).toBe('Paged 01')
    const second = await list({ q: 'paged', page: 2 }, ws)
    expect(second.rows.map(r => r.name)).toEqual(['Paged 26', 'Paged 27', 'Paged 28', 'Paged 29', 'Paged 30'])
    expect(second.statusCounts.draft).toBe(30)
    expect((await list({ q: 'paged', page: 3 }, ws)).rows).toEqual([])
    expect((await list({ q: 'paged', size: 50 }, ws)).pages).toBe(1)
    // Equal keys (the same moment, no stock) fall back to the name and the id, so pages never overlap.
    for (const sort of ['updated', 'stock', 'price'] as const) {
      const whole = (await list({ q: 'paged', sort, dir: 'desc', size: 100 }, ws)).rows.map(r => r.id)
      const pages = [...(await list({ q: 'paged', sort, dir: 'desc' }, ws)).rows, ...(await list({ q: 'paged', sort, dir: 'desc', page: 2 }, ws)).rows]
      expect(pages.map(r => r.id), sort).toEqual(whole)
    }
  })

  it('sorts by price, stock and the latest change in both directions', async () => {
    const cheapest = (await list({ sort: 'price', dir: 'asc' })).rows.map(r => r.priceFromCents!)
    expect(cheapest).toEqual([...cheapest].sort((a, b) => a - b))
    const fullest = (await list({ sort: 'stock', dir: 'desc' })).rows.map(r => r.stock)
    expect(fullest).toEqual([...fullest].sort((a, b) => b - a))
    const latest = (await list({ sort: 'updated', dir: 'desc' })).rows.map(r => r.updatedAt.getTime())
    expect(latest).toEqual([...latest].sort((a, b) => b - a))
  })

  it('counts the statuses apart from the status filter and leaves archived products out of the stock filters', async () => {
    const soldOut = (await list({ stock: 'out' })).rows[0]!
    const draft = (await list({ collection: 'pastel' })).rows.find(r => r.id !== soldOut.id)!
    await admin.query("update fa.products set status = 'archived' where workspace_id = $1 and id = $2", [owner.workspaceId, soldOut.id])
    await admin.query("update fa.products set status = 'draft' where workspace_id = $1 and id = $2", [owner.workspaceId, draft.id])
    const out = await list({ stock: 'out' })
    expect(out.rows.map(r => r.id)).not.toContain(soldOut.id)
    const archived = await list({ status: ['archived'] })
    expect(archived.rows.map(r => r.id)).toEqual([soldOut.id])
    expect(archived.rows[0]!.soldOut).toBe(0)
    expect(archived.statusCounts).toEqual({ published: archived.total - 2, draft: 1, archived: 1 })
    const drafts = await list({ status: ['draft'], collection: 'pastel' })
    expect(drafts.rows.map(r => r.id)).toEqual([draft.id])
    expect(drafts.statusCounts.draft).toBe(1)
  })

  it('reads the same list for a viewer and nothing of another workspace', async () => {
    expect((await list({}, viewer)).rows.map(r => r.id)).toEqual((await list({})).rows.map(r => r.id))
    const other = await sandbox()
    await admin.query("update fa.products set name = 'Renamed elsewhere' where workspace_id = $1 and slug = 'hush'", [other.workspaceId])
    expect((await list({ q: 'Renamed elsewhere' })).rows).toEqual([])
    expect((await list({ q: 'Renamed elsewhere' }, other)).rows.map(r => r.slug)).toEqual(['hush'])
  })
})
