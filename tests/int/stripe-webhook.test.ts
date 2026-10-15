import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleWebhook } from '@/server/stripe/webhook'
import { adminPool, appPool, closeAll } from './db'
import { fakeGateway, keepStoreState, signedEvent, storeSession, TEST_STRIPE } from './stripe'

let admin: pg.Pool
let app: pg.Pool
let restore: () => Promise<void>
const TAG = randomUUID().slice(0, 8)

const ordersOf = async (sessionId: string) =>
  (await admin.query<{ number: number; workspace_kind: string }>(
    'select o.number, w.kind as workspace_kind from fa.orders o join fa.workspaces w on w.id = o.workspace_id where o.stripe_session_id = $1', [sessionId])).rows

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  restore = await keepStoreState(admin)
})
afterAll(async () => {
  await restore()
  await closeAll()
})

describe('the Stripe webhook', () => {
  it('keeps a signed, paid checkout once, and answers a repeat the same', async () => {
    const paid = storeSession(TAG)
    const gateway = fakeGateway([paid])
    const event = signedEvent(paid.session)

    expect(await handleWebhook(event, { config: TEST_STRIPE, gateway, pool: app })).toEqual({ status: 200, body: { received: true } })
    expect(gateway.calls).toEqual([paid.session.id])
    expect(await ordersOf(paid.session.id)).toEqual([{ number: expect.any(Number), workspace_kind: 'owner' }])
    expect((await admin.query('select outcome from fa.stripe_events where event_id = $1', [event.id])).rows).toEqual([{ outcome: 'order' }])
    expect(await handleWebhook(event, { config: TEST_STRIPE, gateway, pool: app })).toEqual({ status: 200, body: { received: true } })
    expect(await ordersOf(paid.session.id)).toHaveLength(1)
  })

  it('refuses a delivery without a signature, with another secret\'s or with an old one', async () => {
    const paid = storeSession(TAG)
    const gateway = fakeGateway([paid])
    const refused = { status: 400, body: { received: false, error: 'signature' } }
    const event = signedEvent(paid.session)

    expect(await handleWebhook({ body: event.body, signature: null }, { config: TEST_STRIPE, gateway, pool: app })).toEqual(refused)
    expect(await handleWebhook(signedEvent(paid.session, { secret: `whsec_${'other'.repeat(6)}` }), { config: TEST_STRIPE, gateway, pool: app })).toEqual(refused)
    expect(await handleWebhook(signedEvent(paid.session, { timestamp: Math.floor(Date.now() / 1000) - 600 }), { config: TEST_STRIPE, gateway, pool: app })).toEqual(refused)

    const tampered = { body: Buffer.from(event.body.toString().replace('12900', '1')), signature: event.signature }

    expect(await handleWebhook(tampered, { config: TEST_STRIPE, gateway, pool: app })).toEqual(refused)
    expect(gateway.calls).toEqual([])
    expect(await ordersOf(paid.session.id)).toEqual([])
  })

  it('answers other events and unpaid sessions without fetching or keeping anything', async () => {
    const paid = storeSession(TAG)
    const unpaid = storeSession(TAG, { payment_status: 'unpaid' })
    const gateway = fakeGateway([paid, unpaid])
    const ok = { status: 200, body: { received: true } }

    expect(await handleWebhook(signedEvent(paid.session, { type: 'checkout.session.expired' }), { config: TEST_STRIPE, gateway, pool: app })).toEqual(ok)
    expect(await handleWebhook(signedEvent(unpaid.session), { config: TEST_STRIPE, gateway, pool: app })).toEqual(ok)
    expect(gateway.calls).toEqual([])
    expect(await ordersOf(paid.session.id)).toEqual([])
  })

  it('records a session the panel cannot keep and answers 200, so Stripe does not send it again', async () => {
    const euro = storeSession(TAG, { currency: 'eur' })
    const event = signedEvent(euro.session)

    expect(await handleWebhook(event, { config: TEST_STRIPE, gateway: fakeGateway([euro]), pool: app })).toEqual({ status: 200, body: { received: true } })
    expect((await admin.query('select outcome from fa.stripe_events where event_id = $1', [event.id])).rows).toEqual([{ outcome: 'skipped:currency' }])
    expect(await ordersOf(euro.session.id)).toEqual([])
  })

  it('answers 500 when the line items cannot be read, keeps nothing, and keeps the order on the retry', async () => {
    const paid = storeSession(TAG)
    const event = signedEvent(paid.session)

    expect(await handleWebhook(event, { config: TEST_STRIPE, gateway: fakeGateway([]), pool: app })).toEqual({ status: 500, body: { received: false, error: 'failed' } })
    expect(await ordersOf(paid.session.id)).toEqual([])
    expect((await admin.query('select 1 from fa.stripe_events where event_id = $1', [event.id])).rowCount).toBe(0)
    expect((await handleWebhook(event, { config: TEST_STRIPE, gateway: fakeGateway([paid]), pool: app })).status).toBe(200)
    expect(await ordersOf(paid.session.id)).toHaveLength(1)
  })
})
