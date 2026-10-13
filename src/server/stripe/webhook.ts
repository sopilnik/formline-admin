import 'server-only'
import type { Pool } from 'pg'
import Stripe from 'stripe'
import { readCheckout, type CheckoutSessionLike } from '@/lib/stripe/checkout'
import type { StripeConfig } from '@/server/config'
import { getPool } from '@/server/db/pool'
import { log } from '@/server/log'
import type { StripeGateway } from '@/server/stripe/gateway'
import { ingestOrder } from '@/server/stripe/ingest'

/** A Checkout Session event is a few kilobytes; anything near this is not one. */
export const WEBHOOK_MAX_BYTES = 64 * 1024

export type WebhookAnswer = { status: 200 | 400 | 500; body: { received: boolean; error?: 'signature' | 'failed' } }

const received: WebhookAnswer = { status: 200, body: { received: true } }

/**
 * One delivery of the store's webhook: the signature against the endpoint's secret and Stripe's five-minute
 * tolerance, then only a paid `checkout.session.completed` goes on. Its line items are fetched before any transaction
 * opens; a session the panel cannot keep is recorded and answered 200, so Stripe does not send it again; a failure on
 * the way answers 500, and Stripe retries.
 */
export async function handleWebhook(
  delivery: { body: Buffer; signature: string | null },
  deps: { config: StripeConfig; gateway: StripeGateway; pool?: Pool },
): Promise<WebhookAnswer> {
  if (!delivery.signature) return { status: 400, body: { received: false, error: 'signature' } }
  let event: Stripe.Event
  try {
    event = Stripe.webhooks.constructEvent(delivery.body, delivery.signature, deps.config.webhookSecret)
  } catch {
    log.warn({ event: 'stripe.signature_refused' })
    return { status: 400, body: { received: false, error: 'signature' } }
  }
  if (event.type !== 'checkout.session.completed') return received
  const session: CheckoutSessionLike = event.data.object
  if (session.payment_status !== 'paid') return received
  const pool = deps.pool ?? getPool()
  try {
    const reading = readCheckout(session, await deps.gateway.lineItems(session.id))
    if (!reading.ok) {
      await pool.query('insert into fa.stripe_events (event_id, outcome) values ($1, $2) on conflict do nothing', [event.id, `skipped:${reading.problem}`])
      log.warn({ event: 'stripe.skipped', stripeEvent: event.id, problem: reading.problem })
      return received
    }
    const result = await ingestOrder(reading.order, { eventId: event.id, pseudonymKey: deps.config.pseudonymKey }, pool)
    log.info({ event: 'stripe.delivery', stripeEvent: event.id, outcome: result.status })
    return received
  } catch (error) {
    log.error({ event: 'stripe.failed', stripeEvent: event.id, err: error })
    return { status: 500, body: { received: false, error: 'failed' } }
  }
}
