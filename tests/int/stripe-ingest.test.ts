import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { IncomingLine, IncomingOrder } from '@/lib/stripe/checkout'
import { parseLineName } from '@/lib/stripe/line-name'
import { users } from '@/server/db/schema'
import { withWorkspace } from '@/server/db/with-workspace'
import { ingestOrder } from '@/server/stripe/ingest'
import { adminPool, appPool, closeAll } from './db'
import { ensureOwner } from './owner'

let admin: pg.Pool
let app: pg.Pool
let owner: string
let ownerUser: string
let startNumber: number
let stocks: { id: string; stock: number; low_stock_threshold: number }[]

// Every row this file makes carries the run's tag, and the file removes them all when it ends.
const TAG = randomUUID().slice(0, 8)
let count = 0

const line = (name: string, qty: number, unitCents: number): IncomingLine => ({ name, qty, unitCents, variant: parseLineName(name) })

function storeOrder(over: Partial<IncomingOrder> = {}): IncomingOrder {
  count += 1
  const lines = over.lines ?? [line('Far Orbit · A2 · Ink', 1, 4700)]
  const subtotalCents = lines.reduce((sum, l) => sum + l.qty * l.unitCents, 0)
  return {
    sessionId: `cs_test_${TAG}_${count}`, placedAt: new Date('2026-09-30T10:00:00Z'), email: `mia.${TAG}@ingest.test`, name: 'Mia Novak',
    city: 'Berlin', country: 'DE', externalRef: `FL-${TAG}-${count}`, delivery: 'standard', subtotalCents, shippingCents: 900,
    totalCents: subtotalCents + 900, ...over, lines,
  }
}

const ingest = (order: IncomingOrder, eventId: string | null = `evt_${TAG}_${count}`) => ingestOrder(order, { eventId }, app)

async function variant(sku: string): Promise<{ id: string; product_id: string; stock: number }> {
  const { rows } = await admin.query<{ id: string; product_id: string; stock: number }>('select id, product_id, stock from fa.product_variants where workspace_id = $1 and sku = $2', [owner, sku])
  return rows[0]!
}

// The owner row changes only by the owner's own hand (the users trigger), so the language is set as the owner.
const setOwnerLocale = (locale: 'en' | 'ru') =>
  withWorkspace({ workspaceId: owner, userId: ownerUser, role: 'owner' }, tx => tx.update(users).set({ locale }).where(eq(users.id, ownerUser)), app)

const setStock = (sku: string, stock: number, threshold: number) =>
  admin.query('update fa.product_variants set stock = $3, low_stock_threshold = $4 where workspace_id = $1 and sku = $2', [owner, sku, stock, threshold])

async function notificationsOf(kind: string): Promise<Record<string, unknown>[]> {
  const { rows } = await admin.query<{ payload: Record<string, unknown>; user_id: string | null }>(
    'select payload, user_id from fa.notifications where workspace_id = $1 and kind = $2 order by created_at, id', [owner, kind])
  expect(rows.every(r => r.user_id === null)).toBe(true)
  return rows.map(r => r.payload)
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  ownerUser = await ensureOwner(admin, app)
  owner = (await admin.query<{ id: string }>("select id from fa.workspaces where kind = 'owner'")).rows[0]!.id
  startNumber = (await admin.query<{ n: number }>('select next_order_number as n from fa.workspace_counters where workspace_id = $1', [owner])).rows[0]!.n
  stocks = (await admin.query<{ id: string; stock: number; low_stock_threshold: number }>('select id, stock, low_stock_threshold from fa.product_variants where workspace_id = $1', [owner])).rows
  await admin.query("delete from fa.notifications where workspace_id = $1 and kind in ('order.created', 'stock.low')", [owner])
})

afterAll(async () => {
  await admin.query("delete from fa.orders where workspace_id = $1 and source = 'stripe'", [owner])
  await admin.query('delete from fa.customers where workspace_id = $1 and email like $2', [owner, `%${TAG}@ingest.test`])
  await admin.query("delete from fa.notifications where workspace_id = $1 and kind in ('order.created', 'stock.low')", [owner])
  await admin.query('delete from fa.stripe_events where event_id like $1', [`evt_${TAG}_%`])
  await admin.query('update fa.workspace_counters set next_order_number = $2 where workspace_id = $1', [owner, startNumber])
  for (const v of stocks) await admin.query('update fa.product_variants set stock = $3, low_stock_threshold = $4 where workspace_id = $1 and id = $2', [owner, v.id, v.stock, v.low_stock_threshold])
  await closeAll()
})

describe('the Stripe ingest', () => {
  it('keeps a paid store order for the owner with its customer, lines, first status and a "New order" for everybody', async () => {
    await setStock('far-orbit-a2-ink', 20, 3)
    const order = storeOrder({ lines: [line('Far Orbit · A2 · Ink', 2, 4700), line('Ninety-Six · A3 · Paper', 1, 2600)] })
    const result = await ingest(order)
    expect(result).toEqual({ status: 'created', orderId: expect.any(String), number: startNumber })
    if (result.status !== 'created') return
    const kept = await admin.query(
      `select o.number, o.status, o.source, o.stripe_session_id, o.external_ref, o.delivery, o.subtotal_cents, o.shipping_cents, o.total_cents,
              o.shipping_address, o.placed_at, c.email, c.name, c.city, c.country, c.pseudonymised_at
         from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id where o.workspace_id = $1 and o.id = $2`,
      [owner, result.orderId])
    expect(kept.rows[0]).toEqual({
      number: startNumber, status: 'paid', source: 'stripe', stripe_session_id: order.sessionId, external_ref: order.externalRef, delivery: 'standard',
      subtotal_cents: 12_000, shipping_cents: 900, total_cents: 12_900, shipping_address: null, placed_at: order.placedAt,
      email: order.email, name: 'Mia Novak', city: 'Berlin', country: 'DE', pseudonymised_at: null,
    })
    const farOrbit = await variant('far-orbit-a2-ink')
    const lines = await admin.query('select variant_id, sku, name, unit_cents, qty, unmatched from fa.order_lines where workspace_id = $1 and order_id = $2 order by name', [owner, result.orderId])
    expect(lines.rows).toEqual([
      { variant_id: farOrbit.id, sku: 'far-orbit-a2-ink', name: 'Far Orbit · A2 · Ink', unit_cents: 4700, qty: 2, unmatched: false },
      { variant_id: (await variant('ninety-six-a3-paper')).id, sku: 'ninety-six-a3-paper', name: 'Ninety-Six · A3 · Paper', unit_cents: 2600, qty: 1, unmatched: false },
    ])
    const events = await admin.query('select kind, from_status, to_status, actor_user_id, at from fa.order_events where workspace_id = $1 and order_id = $2', [owner, result.orderId])
    expect(events.rows).toEqual([{ kind: 'status', from_status: null, to_status: 'paid', actor_user_id: null, at: order.placedAt }])
    expect(farOrbit.stock).toBe(18)
    expect(await notificationsOf('order.created')).toEqual([{ orderId: result.orderId, number: startNumber, customer: 'Mia Novak', totalCents: 12_900 }])
    expect(await notificationsOf('stock.low')).toEqual([])
  })

  it('finds a customer by email whatever its case, and names a nameless new one "Customer"', async () => {
    const first = await admin.query<{ id: string }>('select id from fa.customers where workspace_id = $1 and email = $2', [owner, `mia.${TAG}@ingest.test`])
    const again = await ingest(storeOrder({ email: `MIA.${TAG}@INGEST.TEST`, name: 'Someone Else' }))
    expect(again.status).toBe('created')
    const same = await admin.query<{ customer_id: string }>('select customer_id from fa.orders where workspace_id = $1 and id = $2', [owner, again.status === 'created' ? again.orderId : ''])
    expect(same.rows[0]!.customer_id).toBe(first.rows[0]!.id)
    const nameless = await ingest(storeOrder({ email: `anon.${TAG}@ingest.test`, name: null }))
    const customer = await admin.query<{ name: string }>('select c.name from fa.orders o join fa.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id where o.workspace_id = $1 and o.id = $2',
      [owner, nameless.status === 'created' ? nameless.orderId : ''])
    expect(customer.rows[0]!.name).toBe('Customer')
  })

  it('says "Low stock" when a sale takes a variant across its threshold from above, and only then', async () => {
    await admin.query("delete from fa.notifications where workspace_id = $1 and kind = 'stock.low'", [owner])
    await setStock('far-orbit-a2-ink', 5, 3)
    await ingest(storeOrder({ lines: [line('Far Orbit · A2 · Ink', 2, 4700)] }))
    const farOrbit = await variant('far-orbit-a2-ink')
    expect(farOrbit.stock).toBe(3)
    expect(await notificationsOf('stock.low')).toEqual([{ productId: farOrbit.product_id, product: 'Far Orbit', size: 'a2', palette: 'ink', stock: 3, threshold: 3 }])
    await ingest(storeOrder({ lines: [line('Far Orbit · A2 · Ink', 1, 4700)] }))
    expect((await variant('far-orbit-a2-ink')).stock).toBe(2)
    expect(await notificationsOf('stock.low')).toHaveLength(1)
  })

  it('stops an oversold variant at zero, notes it in the owner\'s language and says by how much', async () => {
    await admin.query("delete from fa.notifications where workspace_id = $1 and kind = 'stock.low'", [owner])
    await setStock('far-orbit-a2-ink', 1, 3)
    await setOwnerLocale('ru')
    try {
      const result = await ingest(storeOrder({ lines: [line('Far Orbit · A2 · Ink', 3, 4700)] }))
      const farOrbit = await variant('far-orbit-a2-ink')
      expect(farOrbit.stock).toBe(0)
      const notes = await admin.query<{ note: string; actor_user_id: string | null }>("select note, actor_user_id from fa.order_events where workspace_id = $1 and order_id = $2 and kind = 'note'",
        [owner, result.status === 'created' ? result.orderId : ''])
      expect(notes.rows).toEqual([{ note: 'Far Orbit · A2 · Ink: продано на 2 шт. больше, чем было на складе.', actor_user_id: null }])
      expect(await notificationsOf('stock.low')).toEqual([{ productId: farOrbit.product_id, product: 'Far Orbit', size: 'a2', palette: 'ink', stock: 0, threshold: 3, oversold: 2 }])
    } finally {
      await setOwnerLocale('en')
    }
  })

  it('keeps a line it cannot match as free text and takes no stock for it', async () => {
    await setStock('far-orbit-a2-ink', 9, 3)
    const result = await ingest(storeOrder({ lines: [line('Far Orbit · A2 · Ink', 1, 4700), line('Gift wrap', 1, 500)] }))
    const lines = await admin.query('select variant_id, sku, name, unmatched from fa.order_lines where workspace_id = $1 and order_id = $2 and unmatched', [owner, result.status === 'created' ? result.orderId : ''])
    expect(lines.rows).toEqual([{ variant_id: null, sku: null, name: 'Gift wrap', unmatched: true }])
    expect((await variant('far-orbit-a2-ink')).stock).toBe(8)
  })

  it('changes nothing on a repeat: the same event again, or a session the import has already kept', async () => {
    const order = storeOrder()
    const eventId = `evt_${TAG}_repeat`
    expect((await ingest(order, eventId)).status).toBe('created')
    const before = await admin.query('select count(*)::int as n from fa.orders where workspace_id = $1', [owner])
    expect(await ingest(order, eventId)).toEqual({ status: 'duplicate' })
    expect(await ingest(order, `evt_${TAG}_other`)).toEqual({ status: 'duplicate' })
    expect(await ingest(order, null)).toEqual({ status: 'duplicate' })
    expect((await admin.query('select count(*)::int as n from fa.orders where workspace_id = $1', [owner])).rows).toEqual(before.rows)
    expect((await admin.query('select 1 from fa.stripe_events where event_id = $1', [`evt_${TAG}_other`])).rowCount).toBe(0)
  })

  it('keeps one order, one stock change and one notification when the same event arrives twice at once', async () => {
    await admin.query("delete from fa.notifications where workspace_id = $1 and kind = 'order.created'", [owner])
    await setStock('far-orbit-a2-ink', 10, 3)
    const order = storeOrder({ lines: [line('Far Orbit · A2 · Ink', 1, 4700)] })
    const eventId = `evt_${TAG}_twice`
    const results = await Promise.all([ingest(order, eventId), ingest(order, eventId)])
    expect(results.map(r => r.status).sort()).toEqual(['created', 'duplicate'])
    expect((await admin.query('select 1 from fa.orders where workspace_id = $1 and stripe_session_id = $2', [owner, order.sessionId])).rowCount).toBe(1)
    expect((await variant('far-orbit-a2-ink')).stock).toBe(9)
    expect(await notificationsOf('order.created')).toHaveLength(1)
  })
})
