import { describe, expect, it } from 'vitest'
import { readCheckout, type CheckoutSessionLike, type LineItemLike } from '@/lib/stripe/checkout'

// A session as the store's checkout Worker creates it: two A2 posters at $47 and one A3 at $26, standard shipping.
const session: CheckoutSessionLike = {
  id: 'cs_test_store_1',
  created: 1_790_000_000,
  payment_status: 'paid',
  currency: 'usd',
  amount_subtotal: 12_000,
  amount_total: 12_900,
  total_details: { amount_shipping: 900 },
  customer_details: { email: 'mia@example.com', name: 'Mia Novak', address: { city: 'Berlin', country: 'de' } },
  metadata: { orderId: 'FL-7Q2K' },
}
const items: LineItemLike[] = [
  { description: 'Far Orbit · A2 · Ink', quantity: 2, amount_subtotal: 9400, price: { unit_amount: 4700 } },
  { description: 'Ninety-Six · A3 · Paper', quantity: 1, amount_subtotal: 2600, price: { unit_amount: 2600 } },
]

describe('readCheckout', () => {
  it('reads a paid session into an order with matched lines', () => {
    const reading = readCheckout(session, items)
    expect(reading).toEqual({
      ok: true,
      order: {
        sessionId: 'cs_test_store_1',
        placedAt: new Date(1_790_000_000_000),
        email: 'mia@example.com',
        name: 'Mia Novak',
        city: 'Berlin',
        country: 'DE',
        externalRef: 'FL-7Q2K',
        delivery: 'standard',
        subtotalCents: 12_000,
        shippingCents: 900,
        totalCents: 12_900,
        lines: [
          { name: 'Far Orbit · A2 · Ink', qty: 2, unitCents: 4700, variant: { sku: 'far-orbit-a2-ink', size: 'a2', palette: 'ink' } },
          { name: 'Ninety-Six · A3 · Paper', qty: 1, unitCents: 2600, variant: { sku: 'ninety-six-a3-paper', size: 'a3', palette: 'paper' } },
        ],
      },
    })
  })

  it('tells express from standard by the amount: $19 is express, $9 and free are standard', () => {
    const express = readCheckout({ ...session, amount_total: 13_900, total_details: { amount_shipping: 1900 } }, items)
    expect(express.ok && express.order.delivery).toBe('express')
    const free = readCheckout({ ...session, amount_total: 12_000, total_details: { amount_shipping: 0 } }, items)
    expect(free.ok && free.order).toMatchObject({ delivery: 'standard', shippingCents: 0 })
    const none = readCheckout({ ...session, amount_total: 12_000, total_details: null }, items)
    expect(none.ok && none.order.shippingCents).toBe(0)
  })

  it('keeps a line it cannot match as free text', () => {
    const reading = readCheckout({ ...session, amount_subtotal: 12_500, amount_total: 13_400 }, [...items, { description: 'Gift wrap', quantity: 1, amount_subtotal: 500, price: null }])
    expect(reading.ok && reading.order.lines[2]).toEqual({ name: 'Gift wrap', qty: 1, unitCents: 500, variant: null })
  })

  it('fills what the session leaves out with nothing rather than a guess', () => {
    const reading = readCheckout({ ...session, customer_details: { email: ' mia@example.com ', name: '  ', address: { city: null, country: 'Germany' } }, metadata: null }, items)
    expect(reading.ok && reading.order).toMatchObject({ email: 'mia@example.com', name: null, city: null, country: null, externalRef: null })
  })

  it('says why it cannot keep a session', () => {
    expect(readCheckout({ ...session, payment_status: 'unpaid' }, items)).toEqual({ ok: false, problem: 'not_paid' })
    expect(readCheckout({ ...session, currency: 'eur' }, items)).toEqual({ ok: false, problem: 'currency' })
    expect(readCheckout({ ...session, customer_details: { name: 'Mia Novak' } }, items)).toEqual({ ok: false, problem: 'email' })
    expect(readCheckout(session, [])).toEqual({ ok: false, problem: 'lines' })
    expect(readCheckout(session, [{ ...items[0]!, quantity: 0 }])).toEqual({ ok: false, problem: 'lines' })
    expect(readCheckout(session, [{ ...items[0]!, price: null, amount_subtotal: 9401 }])).toEqual({ ok: false, problem: 'lines' })
    expect(readCheckout({ ...session, amount_total: 13_000 }, items)).toEqual({ ok: false, problem: 'amounts' })
    expect(readCheckout({ ...session, amount_subtotal: 11_000, amount_total: 11_900 }, items)).toEqual({ ok: false, problem: 'amounts' })
  })
})
