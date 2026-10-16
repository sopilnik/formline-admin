import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { adminPool, closeAll } from './db'
import { createWorkspace, inRollback } from './fixtures'

let admin: pg.Pool
let wsA: string
let wsB: string

beforeAll(async () => {
  admin = adminPool()
  wsA = await createWorkspace(admin)
  wsB = await createWorkspace(admin)
})

afterAll(closeAll)

async function seedCatalog(c: pg.PoolClient, ws: string): Promise<{ collection: string; product: string; variant: string; customer: string; order: string; image: string }> {
  const one = async (sql: string, params: unknown[]) => (await c.query<{ id: string }>(sql, params)).rows[0]!.id
  const collection = await one("insert into fa.collections (workspace_id, slug, name, description, position) values ($1, 'primary', 'Primary', '', 1) returning id", [ws])
  const image = await one("insert into fa.images (workspace_id, storage_path, source, width, height, bytes) values ($1, 'posters/loud.webp', 'static', 720, 1018, 1000) returning id", [ws])
  const product = await one("insert into fa.products (workspace_id, slug, name, collection_id, description, base_price_cents, status, image_id) values ($1, 'loud', 'Loud', $2, '', 2900, 'published', $3) returning id", [ws, collection, image])
  const variant = await one("insert into fa.product_variants (workspace_id, product_id, sku, size, palette, stock) values ($1, $2, 'loud-a3-signal', 'a3', 'signal', 5) returning id", [ws, product])
  const customer = await one("insert into fa.customers (workspace_id, email, name) values ($1, 'maya@example.test', 'Maya') returning id", [ws])
  const order = await one("insert into fa.orders (workspace_id, number, customer_id, status, source, delivery, subtotal_cents, shipping_cents, total_cents, placed_at) values ($1, 1001, $2, 'paid', 'seed', 'standard', 2900, 900, 3800, now()) returning id", [ws, customer])

  return { collection, product, variant, customer, order, image }
}

describe('business schema', () => {
  it('refuses cross-workspace references through composite keys', async () => {
    await inRollback(admin, async c => {
      const a = await seedCatalog(c, wsA)

      await expect(c.query("insert into fa.orders (workspace_id, number, customer_id, status, source, delivery, subtotal_cents, shipping_cents, total_cents, placed_at) values ($1, 2001, $2, 'paid', 'seed', 'standard', 100, 0, 100, now())", [wsB, a.customer])).rejects.toThrow(/foreign key/)
    })

    await inRollback(admin, async c => {
      const a = await seedCatalog(c, wsA)

      await expect(c.query("insert into fa.order_lines (workspace_id, order_id, variant_id, sku, name, unit_cents, qty) values ($1, $2, $3, 'x', 'X', 100, 1)", [wsB, a.order, a.variant])).rejects.toThrow(/foreign key/)
    })
  })

  it('keeps stock at zero or above and totals consistent', async () => {
    await inRollback(admin, async c => {
      const a = await seedCatalog(c, wsA)

      await expect(c.query('update fa.product_variants set stock = -1 where id = $1', [a.variant])).rejects.toThrow(/check constraint/)
    })

    await inRollback(admin, async c => {
      const a = await seedCatalog(c, wsA)

      await expect(c.query('update fa.orders set total_cents = 1 where id = $1', [a.order])).rejects.toThrow(/check constraint/)
    })
  })

  it('numbers and Stripe sessions are unique per workspace only', async () => {
    await inRollback(admin, async c => {
      const a = await seedCatalog(c, wsA)
      const b = await seedCatalog(c, wsB)

      await c.query("update fa.orders set stripe_session_id = 'cs_test_1', source = 'stripe' where id in ($1, $2)", [a.order, b.order])

      await expect(c.query("insert into fa.orders (workspace_id, number, customer_id, status, source, delivery, subtotal_cents, shipping_cents, total_cents, placed_at) values ($1, 1001, $2, 'paid', 'seed', 'standard', 100, 0, 100, now())", [wsA, a.customer])).rejects.toThrow(/orders_workspace_id_number_key/)
    })
  })

  it('clears an image reference without touching the workspace column', async () => {
    await inRollback(admin, async c => {
      const a = await seedCatalog(c, wsA)

      await c.query('delete from fa.images where id = $1', [a.image])

      const { rows } = await c.query('select workspace_id, image_id from fa.products where id = $1', [a.product])

      expect(rows[0]).toEqual({ workspace_id: wsA, image_id: null })
    })
  })

  it('rejects unknown status values and status events without a target', async () => {
    await inRollback(admin, async c => {
      const a = await seedCatalog(c, wsA)

      await expect(c.query("update fa.orders set status = 'lost' where id = $1", [a.order])).rejects.toThrow(/check constraint/)
    })

    await inRollback(admin, async c => {
      const a = await seedCatalog(c, wsA)

      await expect(c.query("insert into fa.order_events (workspace_id, order_id, kind) values ($1, $2, 'status')", [wsA, a.order])).rejects.toThrow(/check constraint/)
    })
  })
})
