import type pg from 'pg'
import { generateTemplate, type TemplateData } from './generator.ts'
import { TEMPLATE_VERSION } from './version.ts'

export type BuildResult = { rebuilt: boolean; version: number; templateWorkspaceId: string; ownerWorkspaceId: string }

/**
 * Builds or rebuilds the template workspace and gives the owner workspace the
 * catalog (spec §6.3). Runs inside migrate as schema_owner in one transaction.
 * Generated rows are replaced; copies of store orders (source = 'stripe' and
 * customers with pseudonymised_at) are kept and numbered after the generated
 * orders; every existing sandbox is untouched; the owner workspace only receives
 * catalog rows it lacks, never changes to its own.
 */
export async function buildTemplate(client: pg.ClientBase, options: { version?: number; force?: boolean } = {}): Promise<BuildResult> {
  const version = options.version ?? TEMPLATE_VERSION
  await client.query('begin')
  try {
    await client.query('set local role schema_owner')
    await client.query('set local search_path = pg_catalog')

    await client.query("insert into fa.workspaces (kind) select 'template' where not exists (select 1 from fa.workspaces w where w.kind = 'template')")
    const { rows } = await client.query<{ id: string; kind: 'template' | 'owner'; template_version: number | null }>(
      "select id, kind, template_version from fa.workspaces where kind in ('template', 'owner')")
    const template = rows.find(r => r.kind === 'template')!
    const owner = rows.find(r => r.kind === 'owner')
    if (!owner) throw new Error('the owner workspace does not exist; the migrations create it')
    const result = { version, templateWorkspaceId: template.id, ownerWorkspaceId: owner.id }

    if (template.template_version === version && !options.force) {
      await client.query('commit')
      return { rebuilt: false, ...result }
    }

    const data = generateTemplate(version)
    // The order ingest numbers its copies from the template's counter; holding it keeps a copy out of the renumbering below.
    await client.query('select 1 from fa.workspace_counters where workspace_id = $1 for update', [template.id])

    await writeUsers(client, template.id, data)
    await writeCatalog(client, template.id, data, 'replace')
    await writeCatalog(client, owner.id, data, 'keep')

    await client.query("delete from fa.orders where workspace_id = $1 and source = 'seed'", [template.id])
    await client.query('delete from fa.customers where workspace_id = $1 and pseudonymised_at is null', [template.id])

    // Copies of store orders step aside while the generated orders take their numbers, then follow them in time order,
    // so a version with more generated orders never meets a copy's number.
    await client.query("update fa.orders set number = number + 1000000 where workspace_id = $1 and source = 'stripe'", [template.id])
    await writeOrders(client, template.id, data)

    const generated = data.orders.reduce((max, o) => Math.max(max, o.number), 0)
    const copies = await client.query(
      `with numbered as (select id, row_number() over (order by placed_at, id) as n from fa.orders where workspace_id = $1 and source = 'stripe')
       update fa.orders o set number = $2 + numbered.n from numbered where o.workspace_id = $1 and o.id = numbered.id`,
      [template.id, generated])

    await client.query(
      `insert into fa.workspace_counters (workspace_id, next_order_number) values ($1, $2)
       on conflict (workspace_id) do update set next_order_number = excluded.next_order_number`,
      [template.id, generated + (copies.rowCount ?? 0) + 1])
    await client.query('insert into fa.workspace_counters (workspace_id, next_order_number) values ($1, 1001) on conflict (workspace_id) do nothing', [owner.id])

    await client.query('insert into fa.store_settings (workspace_id) values ($1), ($2) on conflict (workspace_id) do nothing', [template.id, owner.id])
    await client.query('update fa.workspaces set template_version = $2, template_epoch = $3 where id = $1', [template.id, version, data.epoch])

    await client.query('commit')
    return { rebuilt: true, ...result }
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

async function writeUsers(client: pg.ClientBase, workspaceId: string, data: TemplateData): Promise<void> {
  for (const u of data.users) {
    await client.query(
      `insert into fa.users (workspace_id, id, email, name, role, created_at) values ($1, $2, $3, $4, $5, $6)
       on conflict (workspace_id, id) do update set email = excluded.email, name = excluded.name, role = excluded.role`,
      [workspaceId, u.id, u.email, u.name, u.role, u.createdAt])
  }
}

async function writeCatalog(client: pg.ClientBase, workspaceId: string, data: TemplateData, mode: 'replace' | 'keep'): Promise<void> {
  const keep = mode === 'keep'
  for (const c of data.collections) {
    await client.query(
      `insert into fa.collections (workspace_id, id, slug, name, description, position) values ($1, $2, $3, $4, $5, $6)
       on conflict (workspace_id, id) do ${keep ? 'nothing' : 'update set slug = excluded.slug, name = excluded.name, description = excluded.description, position = excluded.position'}`,
      [workspaceId, c.id, c.slug, c.name, c.description, c.position])
  }
  for (const i of data.images) {
    await client.query(
      `insert into fa.images (workspace_id, id, storage_path, source, width, height, bytes, created_at) values ($1, $2, $3, 'static', $4, $5, $6, $7)
       on conflict (workspace_id, id) do ${keep ? 'nothing' : 'update set storage_path = excluded.storage_path, width = excluded.width, height = excluded.height, bytes = excluded.bytes'}`,
      [workspaceId, i.id, i.storagePath, i.width, i.height, i.bytes, i.createdAt])
  }
  for (const p of data.products) {
    await client.query(
      `insert into fa.products (workspace_id, id, slug, name, collection_id, description, base_price_cents, status, tags, image_id, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (workspace_id, id) do ${keep ? 'nothing' : 'update set slug = excluded.slug, name = excluded.name, collection_id = excluded.collection_id, description = excluded.description, base_price_cents = excluded.base_price_cents, status = excluded.status, tags = excluded.tags, image_id = excluded.image_id, updated_at = excluded.updated_at'}`,
      [workspaceId, p.id, p.slug, p.name, p.collectionId, p.description, p.basePriceCents, p.status, p.tags, p.imageId, p.createdAt, p.updatedAt])
  }
  for (const v of data.variants) {
    await client.query(
      `insert into fa.product_variants (workspace_id, id, product_id, sku, size, palette, stock, low_stock_threshold) values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (workspace_id, id) do ${keep ? 'nothing' : 'update set product_id = excluded.product_id, sku = excluded.sku, size = excluded.size, palette = excluded.palette, price_override_cents = null, stock = excluded.stock, low_stock_threshold = excluded.low_stock_threshold'}`,
      [workspaceId, v.id, v.productId, v.sku, v.size, v.palette, v.stock, v.lowStockThreshold])
  }
}

async function writeOrders(client: pg.ClientBase, workspaceId: string, data: TemplateData): Promise<void> {
  const c = data.customers
  await client.query(
    `insert into fa.customers (workspace_id, id, email, name, city, country, created_at)
     select $1::uuid, * from unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[])`,
    [workspaceId, c.map(x => x.id), c.map(x => x.email), c.map(x => x.name), c.map(x => x.city), c.map(x => x.country), c.map(x => x.createdAt)])
  const o = data.orders
  await client.query(
    `insert into fa.orders (workspace_id, id, number, customer_id, status, source, delivery, subtotal_cents, shipping_cents, total_cents, shipping_address, placed_at, updated_at)
     select $1::uuid, * from unnest($2::uuid[], $3::integer[], $4::uuid[], $5::text[], $6::text[], $7::text[], $8::integer[], $9::integer[], $10::integer[], $11::jsonb[], $12::timestamptz[], $13::timestamptz[])`,
    [workspaceId, o.map(x => x.id), o.map(x => x.number), o.map(x => x.customerId), o.map(x => x.status), o.map(() => 'seed'), o.map(x => x.delivery),
      o.map(x => x.subtotalCents), o.map(x => x.shippingCents), o.map(x => x.totalCents), o.map(x => JSON.stringify(x.shippingAddress)), o.map(x => x.placedAt), o.map(x => x.updatedAt)])
  const l = data.lines
  await client.query(
    `insert into fa.order_lines (workspace_id, id, order_id, variant_id, sku, name, unit_cents, qty)
     select $1::uuid, * from unnest($2::uuid[], $3::uuid[], $4::uuid[], $5::text[], $6::text[], $7::integer[], $8::integer[])`,
    [workspaceId, l.map(x => x.id), l.map(x => x.orderId), l.map(x => x.variantId), l.map(x => x.sku), l.map(x => x.name), l.map(x => x.unitCents), l.map(x => x.qty)])
  const e = data.events
  await client.query(
    `insert into fa.order_events (workspace_id, id, order_id, kind, from_status, to_status, note, actor_user_id, at)
     select $1::uuid, * from unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::text[], $7::text[], $8::uuid[], $9::timestamptz[])`,
    [workspaceId, e.map(x => x.id), e.map(x => x.orderId), e.map(x => x.kind), e.map(x => x.fromStatus), e.map(x => x.toStatus), e.map(x => x.note), e.map(x => x.actorUserId), e.map(x => x.at)])
}
