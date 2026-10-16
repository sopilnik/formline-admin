import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildTemplate } from '../../db/seed/build.ts'
import { CUSTOMER_COUNT, ORDER_COUNT } from '../../db/seed/generator.ts'
import { TEMPLATE_EPOCH, TEMPLATE_VERSION } from '../../db/seed/version.ts'
import { adminPool, closeAll } from './db'
import { asSchemaOwner, createWorkspace } from './fixtures'

let admin: pg.Pool
let template: string
let owner: string

const TABLES = ['users', 'collections', 'images', 'products', 'product_variants', 'customers', 'orders', 'order_lines', 'order_events'] as const

async function counts(workspaceId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}

  for (const table of TABLES) {
    const { rows } = await admin.query<{ n: string }>(`select count(*) as n from fa.${table} where workspace_id = $1`, [workspaceId])

    out[table] = Number(rows[0]!.n)
  }

  return out
}

async function build(options: { force?: boolean } = {}) {
  const client = await admin.connect()

  try {
    return await buildTemplate(client, options)
  } finally {
    client.release()
  }
}

beforeAll(async () => {
  admin = adminPool()

  const { rows } = await admin.query<{ id: string; kind: string }>("select id, kind from fa.workspaces where kind in ('template', 'owner')")

  template = rows.find(r => r.kind === 'template')!.id
  owner = rows.find(r => r.kind === 'owner')!.id
})

afterAll(closeAll)

describe('the template build', () => {
  it('ran with the migrations: the template carries the version, the epoch and the generated data', async () => {
    const { rows } = await admin.query<{ template_version: number; template_epoch: Date }>('select template_version, template_epoch from fa.workspaces where id = $1', [template])

    expect(rows[0]).toEqual({ template_version: TEMPLATE_VERSION, template_epoch: TEMPLATE_EPOCH })

    const c = await counts(template)

    expect(c).toMatchObject({ users: 4, collections: 4, images: 16, products: 16, customers: CUSTOMER_COUNT, orders: ORDER_COUNT })
    expect(c.order_lines).toBeGreaterThanOrEqual(ORDER_COUNT)
    expect(c.order_events).toBeGreaterThanOrEqual(ORDER_COUNT)

    const counters = await admin.query<{ next_order_number: number }>('select next_order_number from fa.workspace_counters where workspace_id = $1', [template])

    expect(counters.rows[0]?.next_order_number).toBe(1001 + ORDER_COUNT)

    const settings = await admin.query('select 1 from fa.store_settings where workspace_id = $1', [template])

    expect(settings.rowCount).toBe(1)
  })

  it('gave the owner workspace the catalog, no orders and no customers', async () => {
    const c = await counts(owner)

    expect(c).toMatchObject({ collections: 4, images: 16, products: 16, customers: 0, orders: 0 })

    const templateProducts = await admin.query<{ id: string }>('select id from fa.products where workspace_id = $1 order by id', [template])
    const ownerProducts = await admin.query<{ id: string }>('select id from fa.products where workspace_id = $1 order by id', [owner])

    expect(ownerProducts.rows).toEqual(templateProducts.rows)

    const counters = await admin.query<{ next_order_number: number }>('select next_order_number from fa.workspace_counters where workspace_id = $1', [owner])

    expect(counters.rows[0]?.next_order_number).toBe(1001)
  })

  it('does nothing when the version is unchanged', async () => {
    const before = await counts(template)
    const result = await build()

    expect(result).toMatchObject({ rebuilt: false, version: TEMPLATE_VERSION, templateWorkspaceId: template, ownerWorkspaceId: owner })
    expect(await counts(template)).toEqual(before)
  })

  it('rebuilds generated rows only: store-order copies, owner edits and sandboxes survive, the copies numbered after the generated orders', async () => {
    // A store-order copy in the template (what the Stripe ingest writes), an owner stock edit and a sandbox with data.
    const copy = await asSchemaOwner(admin, async c => {
      const customer = await c.query<{ id: string }>(
        "insert into fa.customers (workspace_id, email, name, pseudonymised_at) values ($1, 'copy@example.test', 'Store Copy', now()) returning id", [template])
      const order = await c.query<{ id: string }>(
        "insert into fa.orders (workspace_id, number, customer_id, status, source, stripe_session_id, delivery, subtotal_cents, shipping_cents, total_cents, placed_at) values ($1, 5000, $2, 'paid', 'stripe', 'cs_test_copy', 'standard', 2900, 900, 3800, '2026-03-03T10:00:00Z') returning id",
        [template, customer.rows[0]!.id])

      return { customer: customer.rows[0]!.id, order: order.rows[0]!.id }
    })
    const variant = (await admin.query<{ id: string }>("select id from fa.product_variants where workspace_id = $1 and sku = 'loud-a3-signal'", [owner])).rows[0]!.id

    await asSchemaOwner(admin, c => c.query('update fa.product_variants set stock = 99 where workspace_id = $1 and id = $2', [owner, variant]))

    const sandbox = await createWorkspace(admin)

    await asSchemaOwner(admin, c => c.query("insert into fa.collections (workspace_id, slug, name) values ($1, 'kept', 'Kept')", [sandbox]))

    const result = await build({ force: true })

    expect(result.rebuilt).toBe(true)

    const c = await counts(template)

    expect(c.orders).toBe(ORDER_COUNT + 1)
    expect(c.customers).toBe(CUSTOMER_COUNT + 1)

    const kept = await admin.query<{ number: number; placed_at: Date; customer_id: string }>('select number, placed_at, customer_id from fa.orders where workspace_id = $1 and id = $2', [template, copy.order])

    expect(kept.rows[0]).toEqual({ number: 1001 + ORDER_COUNT, placed_at: new Date('2026-03-03T10:00:00Z'), customer_id: copy.customer })

    const stock = await admin.query<{ stock: number }>('select stock from fa.product_variants where workspace_id = $1 and id = $2', [owner, variant])

    expect(stock.rows[0]?.stock).toBe(99)

    const collections = await admin.query('select 1 from fa.collections where workspace_id = $1', [sandbox])

    expect(collections.rowCount).toBe(1)

    const counters = await admin.query<{ next_order_number: number }>('select next_order_number from fa.workspace_counters where workspace_id = $1', [template])

    expect(counters.rows[0]?.next_order_number).toBe(1002 + ORDER_COUNT)

    await asSchemaOwner(admin, async c => {
      await c.query('delete from fa.orders where workspace_id = $1 and id = $2', [template, copy.order])
      await c.query('delete from fa.customers where workspace_id = $1 and id = $2', [template, copy.customer])
      await c.query('delete from fa.workspaces where id = $1', [sandbox])
    })
  })

  it('gives the owner the catalog only once: a rebuild brings back no deleted product and meets no reused slug', async () => {
    const saved = await admin.query<{ product: { id: string }; variants: object[] }>(
      `select to_jsonb(p) as product, (select jsonb_agg(to_jsonb(v)) from fa.product_variants v where v.workspace_id = p.workspace_id and v.product_id = p.id) as variants
       from fa.products p where p.workspace_id = $1 and p.slug = 'hush'`, [owner])
    const { product, variants } = saved.rows[0]!
    const slow = (await admin.query<{ id: string }>("select id from fa.products where workspace_id = $1 and slug = 'slow'", [owner])).rows[0]!.id

    await asSchemaOwner(admin, async c => {
      await c.query('delete from fa.products where workspace_id = $1 and id = $2', [owner, product.id])
      await c.query("update fa.products set slug = 'hush' where workspace_id = $1 and id = $2", [owner, slow])
    })

    try {
      expect((await build({ force: true })).rebuilt).toBe(true)

      const owned = await admin.query<{ id: string; slug: string }>("select id, slug from fa.products where workspace_id = $1 and slug in ('hush', 'slow')", [owner])

      expect(owned.rows).toEqual([{ id: slow, slug: 'hush' }])
    } finally {
      await asSchemaOwner(admin, async c => {
        await c.query("update fa.products set slug = 'slow' where workspace_id = $1 and id = $2", [owner, slow])
        await c.query('insert into fa.products select * from jsonb_populate_record(null::fa.products, $1::jsonb)', [JSON.stringify(product)])
        await c.query('insert into fa.product_variants select * from jsonb_populate_recordset(null::fa.product_variants, $1::jsonb)', [JSON.stringify(variants)])
      })
    }
  })
})
