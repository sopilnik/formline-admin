import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import Stripe from 'stripe'
import type { CheckoutSessionLike, LineItemLike } from '@/lib/stripe/checkout'
import type { StripeConfig } from '@/server/config'
import type { StripeGateway } from '@/server/stripe/gateway'

/** The ingest's settings in the integration tests; local test values, built so no line looks like a real key. */
export const TEST_STRIPE: StripeConfig = {
  webhookSecret: `whsec_${'int'.repeat(12)}`,
  restrictedKey: `rk_test_${'int'.repeat(12)}`,
  pseudonymKey: 'test-pseudonym-key-0123456789abcdef0123456789',
  apiBase: null,
}

/** A session as the store's checkout Worker creates it, paid: two A2 posters and one A3, standard shipping. */
export function storeSession(tag: string, over: Partial<CheckoutSessionLike> = {}): { session: CheckoutSessionLike; items: LineItemLike[] } {
  return {
    session: {
      id: `cs_test_${tag}_${randomUUID().slice(0, 8)}`,
      created: Math.floor(Date.now() / 1000) - 60,
      payment_status: 'paid',
      currency: 'usd',
      amount_subtotal: 12_000,
      amount_total: 12_900,
      total_details: { amount_shipping: 900 },
      customer_details: { email: `mia.${tag}@store.test`, name: 'Mia Novak', address: { city: 'Berlin', country: 'DE' } },
      metadata: { orderId: `FL-${tag}` },
      ...over,
    },
    items: [
      { description: 'Far Orbit · A2 · Ink', quantity: 2, amount_subtotal: 9400, price: { unit_amount: 4700 } },
      { description: 'Ninety-Six · A3 · Paper', quantity: 1, amount_subtotal: 2600, price: { unit_amount: 2600 } },
    ],
  }
}

/** A gateway that answers from the sessions it was given; `lineItems` of an unknown session fails as Stripe's would. */
export function fakeGateway(known: { session: CheckoutSessionLike; items: LineItemLike[] }[]): StripeGateway & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async lineItems(sessionId) {
      calls.push(sessionId)
      const found = known.find(k => k.session.id === sessionId)
      if (!found) throw new Error(`No such checkout.session: ${sessionId}`)
      return found.items
    },
    async completedSessions(since, max) {
      const sessions = known.map(k => k.session).filter(s => s.created * 1000 >= since.getTime()).sort((a, b) => b.created - a.created)
      return { sessions: sessions.slice(0, max), more: sessions.length > max }
    },
  }
}

/** The body and the Stripe-Signature header of a `checkout.session.completed` event, signed with the test secret. */
export function signedEvent(session: CheckoutSessionLike, over: { id?: string; type?: string; timestamp?: number; secret?: string } = {}): { body: Buffer; signature: string; id: string } {
  const id = over.id ?? `evt_${randomUUID().replaceAll('-', '')}`
  const body = JSON.stringify({ id, object: 'event', type: over.type ?? 'checkout.session.completed', data: { object: { object: 'checkout.session', ...session } } })
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: over.secret ?? TEST_STRIPE.webhookSecret, timestamp: over.timestamp })
  return { body: Buffer.from(body), signature, id }
}

/**
 * Everything the Stripe tests of a file change in the shared database, put back when the file ends: the store orders
 * of the owner and the template with their customers, the two order counters, the owner's stock and notifications,
 * and the recorded events.
 */
export async function keepStoreState(admin: pg.Pool): Promise<() => Promise<void>> {
  const { rows: spaces } = await admin.query<{ id: string; kind: string }>("select id, kind from fa.workspaces where kind in ('owner', 'template')")
  const owner = spaces.find(s => s.kind === 'owner')!.id
  const template = spaces.find(s => s.kind === 'template')!.id
  const counters = (await admin.query<{ workspace_id: string; next_order_number: number }>(
    'select workspace_id, next_order_number from fa.workspace_counters where workspace_id = any($1::uuid[])', [[owner, template]])).rows
  const stocks = (await admin.query<{ id: string; stock: number; low_stock_threshold: number }>(
    'select id, stock, low_stock_threshold from fa.product_variants where workspace_id = $1', [owner])).rows
  const customers = (await admin.query<{ id: string }>('select id from fa.customers where workspace_id = any($1::uuid[])', [[owner, template]])).rows.map(r => r.id)
  const events = (await admin.query<{ event_id: string }>('select event_id from fa.stripe_events')).rows.map(r => r.event_id)
  return async () => {
    await admin.query("delete from fa.orders where workspace_id = any($1::uuid[]) and source = 'stripe'", [[owner, template]])
    await admin.query('delete from fa.customers where workspace_id = any($1::uuid[]) and not (id = any($2::uuid[]))', [[owner, template], customers])
    await admin.query("delete from fa.notifications where workspace_id = $1 and kind in ('order.created', 'stock.low')", [owner])
    await admin.query('delete from fa.stripe_events where not (event_id = any($1::text[]))', [events])
    for (const c of counters) await admin.query('update fa.workspace_counters set next_order_number = $2 where workspace_id = $1', [c.workspace_id, c.next_order_number])
    for (const v of stocks) await admin.query('update fa.product_variants set stock = $3, low_stock_threshold = $4 where workspace_id = $1 and id = $2', [owner, v.id, v.stock, v.low_stock_threshold])
  }
}
