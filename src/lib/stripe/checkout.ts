import { parseLineName, type LineVariant } from '@/lib/stripe/line-name'
// The store's rates come with the catalog snapshot: express $19, standard $9 or free from $150.
import { SHIPPING_CENTS } from '@seed/catalog'

// What the ingest reads from a Checkout Session and its line items (spec §7.2). Plain shapes, so the webhook, the
// import and the tests hand over the same fields whether they come from Stripe's SDK or from a fixture.

export type CheckoutSessionLike = {
  id: string
  /** Seconds since the epoch, as Stripe sends it. */
  created: number
  payment_status: string
  currency: string | null
  amount_subtotal: number | null
  amount_total: number | null
  total_details?: { amount_shipping?: number | null } | null
  customer_details?: { email?: string | null; name?: string | null; address?: { city?: string | null; country?: string | null } | null } | null
  metadata?: Record<string, string> | null
}

export type LineItemLike = {
  description?: string | null
  quantity?: number | null
  amount_subtotal?: number | null
  price?: { unit_amount?: number | null } | null
}

export type IncomingLine = { name: string; qty: number; unitCents: number; variant: LineVariant | null }

export type IncomingOrder = {
  sessionId: string
  placedAt: Date
  email: string
  name: string | null
  city: string | null
  country: string | null
  /** The store's own order id (`metadata.orderId`). */
  externalRef: string | null
  delivery: 'standard' | 'express'
  subtotalCents: number
  shippingCents: number
  totalCents: number
  lines: IncomingLine[]
}

export type CheckoutProblem = 'not_paid' | 'currency' | 'email' | 'lines' | 'amounts'
export type CheckoutReading = { ok: true; order: IncomingOrder } | { ok: false; problem: CheckoutProblem }

const cents = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null

const cut = (value: string | null | undefined, max: number): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed.slice(0, max)
}

function readLine(item: LineItemLike): IncomingLine | null {
  const name = cut(item.description, 200)
  const qty = item.quantity
  if (!name || typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) return null
  const subtotal = cents(item.amount_subtotal)
  const unitCents = cents(item.price?.unit_amount) ?? (subtotal !== null && subtotal % qty === 0 ? subtotal / qty : null)
  if (unitCents === null) return null
  return { name, qty, unitCents, variant: parseLineName(name) }
}

/**
 * A paid session of the store, read into the order the panel keeps; a session the panel cannot keep as it is says
 * why. The amounts must add up the way the store builds them — lines to the subtotal, subtotal and shipping to the
 * total — since the orders table holds that sum as a rule.
 */
export function readCheckout(session: CheckoutSessionLike, items: readonly LineItemLike[]): CheckoutReading {
  if (session.payment_status !== 'paid') return { ok: false, problem: 'not_paid' }
  if (session.currency !== 'usd') return { ok: false, problem: 'currency' }
  const email = cut(session.customer_details?.email, 254)
  if (!email || email.length < 3 || !email.includes('@')) return { ok: false, problem: 'email' }
  const lines = items.map(readLine)
  if (lines.length === 0 || lines.some(line => line === null)) return { ok: false, problem: 'lines' }
  const read = lines as IncomingLine[]
  const subtotalCents = cents(session.amount_subtotal)
  const shippingCents = cents(session.total_details?.amount_shipping ?? 0)
  const totalCents = cents(session.amount_total)
  if (subtotalCents === null || shippingCents === null || totalCents === null) return { ok: false, problem: 'amounts' }
  const linesCents = read.reduce((sum, line) => sum + line.qty * line.unitCents, 0)
  if (linesCents !== subtotalCents || subtotalCents + shippingCents !== totalCents) return { ok: false, problem: 'amounts' }
  const country = session.customer_details?.address?.country?.trim().toUpperCase() ?? ''
  return {
    ok: true,
    order: {
      sessionId: session.id,
      placedAt: new Date(session.created * 1000),
      email,
      name: cut(session.customer_details?.name, 120),
      city: cut(session.customer_details?.address?.city, 80),
      country: /^[A-Z]{2}$/.test(country) ? country : null,
      externalRef: cut(session.metadata?.orderId, 100),
      // Only express costs $19, so the amount alone tells the two apart.
      delivery: shippingCents === SHIPPING_CENTS.express ? 'express' : 'standard',
      subtotalCents,
      shippingCents,
      totalCents,
      lines: read,
    },
  }
}
