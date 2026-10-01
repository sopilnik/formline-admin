import 'server-only'
import Stripe from 'stripe'
import type { CheckoutSessionLike, LineItemLike } from '@/lib/stripe/checkout'
import type { StripeConfig } from '@/server/config'

/** The two reads the ingest makes from Stripe with the restricted key (spec §4.4, §7.5); the tests stand in their own. */
export type StripeGateway = {
  /** Every line item of a session. */
  lineItems(sessionId: string): Promise<LineItemLike[]>
  /** The completed sessions created since the moment, newest first, at most `max`; `more` says there were others. */
  completedSessions(since: Date, max: number): Promise<{ sessions: CheckoutSessionLike[]; more: boolean }>
}

export function stripeGateway(config: StripeConfig): StripeGateway {
  const base = config.apiBase
  const stripe = new Stripe(config.restrictedKey, {
    maxNetworkRetries: 2,
    timeout: 10_000,
    telemetry: false,
    ...(base ? { protocol: base.protocol === 'https:' ? 'https' : 'http', host: base.hostname, port: Number(base.port || (base.protocol === 'https:' ? 443 : 80)) } : {}),
  })
  return {
    async lineItems(sessionId) {
      const items: LineItemLike[] = []
      for await (const item of stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 })) items.push(item)
      return items
    },
    async completedSessions(since, max) {
      const sessions: CheckoutSessionLike[] = []
      for await (const session of stripe.checkout.sessions.list({ status: 'complete', created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100 })) {
        if (sessions.length === max) return { sessions, more: true }
        sessions.push(session)
      }
      return { sessions, more: false }
    },
  }
}
