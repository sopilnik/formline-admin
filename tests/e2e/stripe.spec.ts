import { randomUUID } from 'node:crypto'
import type { APIRequestContext } from '@playwright/test'
import Stripe from 'stripe'
import { expectNoSeriousA11yViolations } from './a11y.ts'
import { E2E_ORIGIN_SECRET, E2E_STRIPE_ENV, E2E_STRIPE_PORT } from './constants.ts'
import { ageOwnerAuthentication, asSchemaOwner } from './db.ts'
import { signInAsOwner, signInAsSandboxUser } from './sessions.ts'
import { expect, test } from './test.ts'

// The store's orders reach the owner workspace through the signed webhook, with the line items read from the local
// stand-in for Stripe's API. The tests share the owner workspace and run in order.
test.describe.configure({ mode: 'serial' })
test.use({ extraHTTPHeaders: { 'x-origin-auth': E2E_ORIGIN_SECRET, 'x-client-ip': '203.0.113.54' } })

const TAG = randomUUID().slice(0, 8)
const BUYER = 'Ines Lindqvist'

/** A paid store checkout as the store's Worker creates it: one Far Orbit, A2, Ink, and express shipping. */
function checkout(n: number, minutesAgo: number) {
  return {
    session: {
      id: `cs_test_e2e_${TAG}_${n}`, object: 'checkout.session', created: Math.floor(Date.now() / 1000) - minutesAgo * 60, status: 'complete',
      payment_status: 'paid', currency: 'usd', amount_subtotal: 4700, amount_total: 6600, total_details: { amount_shipping: 1900 },
      customer_details: { email: `ines.${TAG}.${n}@store.test`, name: BUYER, address: { city: 'Stockholm', country: 'SE' } },
      metadata: { orderId: `FL-${TAG}-${n}` },
    },
    lineItems: [{ object: 'item', description: 'Far Orbit · A2 · Ink', quantity: 1, amount_subtotal: 4700, amount_total: 4700, price: { unit_amount: 4700 } }],
  }
}

async function offer(request: APIRequestContext, fixture: ReturnType<typeof checkout>): Promise<void> {
  expect((await request.post(`http://127.0.0.1:${E2E_STRIPE_PORT}/__stub/sessions`, { data: fixture })).status()).toBe(201)
}

type Delivery = { session: object; secret?: string; id?: string }

function deliver(request: APIRequestContext, { session, secret = E2E_STRIPE_ENV.STRIPE_WEBHOOK_SECRET, id = `evt_e2e_${randomUUID().replaceAll('-', '')}` }: Delivery) {
  const payload = JSON.stringify({ id, object: 'event', type: 'checkout.session.completed', data: { object: session } })
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret })

  return request.post('/api/stripe/webhook', { data: payload, headers: { 'content-type': 'application/json', 'stripe-signature': signature } })
}

const numberOf = (sessionId: string) => asSchemaOwner(async client =>
  (await client.query<{ number: number }>('select number from fa.orders where stripe_session_id = $1', [sessionId])).rows[0]?.number)

const OWNER_VARIANT = "workspace_id = (select id from fa.workspaces where kind = 'owner') and sku = 'far-orbit-a2-ink'"
const setOwnerStock = (stock: number) => asSchemaOwner(client => client.query(`update fa.product_variants set stock = $1 where ${OWNER_VARIANT}`, [stock]))
const ownerStock = () => asSchemaOwner(async client => (await client.query<{ stock: number }>(`select stock from fa.product_variants where ${OWNER_VARIANT}`)).rows[0]!.stock)

test('a store order arrives through the webhook: the owner sees it, its stock is taken, and a repeat changes nothing', async ({ page, context, request }) => {
  const order = checkout(1, 1)

  await offer(request, order)
  await setOwnerStock(5)

  const event = `evt_e2e_${TAG}_1`
  const first = await deliver(request, { session: order.session, id: event })

  expect(first.status()).toBe(200)
  expect(await first.json()).toEqual({ received: true })
  expect((await deliver(request, { session: order.session, id: event })).status()).toBe(200)

  const number = await numberOf(order.session.id)

  expect(number).toEqual(expect.any(Number))
  expect(await ownerStock()).toBe(4)

  await signInAsOwner(context)
  await page.goto('/orders?source=stripe')
  await expect(page.getByRole('table', { name: 'Orders' }).getByRole('row').filter({ hasText: `#${number}` })).toContainText(BUYER)
  await page.goto(`/orders/${number}`)
  await expect(page.getByRole('heading', { level: 1, name: `Order #${number}` })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Far Orbit · A2 · Ink' })).toBeVisible()
  await expect(page.getByText('The store does not collect shipping addresses.')).toBeVisible()
  await expect(page.getByText('Delivery: Express')).toBeVisible()
  await expectNoSeriousA11yViolations(page)
  await page.getByRole('button', { name: /^Notifications/ }).click()
  await expect(page.getByRole('dialog', { name: 'Notifications' }).getByText(`New order #${number}`)).toBeVisible()
})

test('a new sandbox shows the order as a copy under a pseudonym, never the buyer', async ({ page, context }) => {
  await signInAsSandboxUser(context)
  await page.goto('/orders?source=stripe')

  const rows = page.getByRole('table', { name: 'Orders' }).getByRole('row').filter({ hasText: 'Store' })

  await expect(rows.first()).toBeVisible()
  await expect(rows.first()).toContainText('$66.00')
  await expect(page.getByText(BUYER)).toHaveCount(0)
  await expect(page.getByText(`${TAG}`)).toHaveCount(0)
})

test('a delivery without Stripe\'s signature, signed with another secret or too large is refused', async ({ request }) => {
  const order = checkout(2, 2)
  const unsigned = await request.post('/api/stripe/webhook', { data: JSON.stringify({ id: 'evt_unsigned', type: 'checkout.session.completed', data: { object: order.session } }) })

  expect(unsigned.status()).toBe(400)
  expect((await deliver(request, { session: order.session, secret: `whsec_${'other'.repeat(8)}` })).status()).toBe(400)

  const large = await request.post('/api/stripe/webhook', { data: 'x'.repeat(70 * 1024), headers: { 'stripe-signature': 't=1,v1=0' } })

  expect(large.status()).toBe(413)
  expect(await numberOf(order.session.id)).toBeUndefined()
})

test('the owner imports a store order the webhook missed, after a fresh sign-in, and the log keeps it', async ({ page, context, request }) => {
  const missed = checkout(3, 5)

  await offer(request, missed)
  await signInAsOwner(context)
  await ageOwnerAuthentication()
  await page.goto('/settings/store')

  const section = page.getByRole('region', { name: 'Store orders' })

  await expect(section).toContainText("Confirm it's you above to import.")
  await expect(section.getByRole('button', { name: 'Import missed orders' })).toHaveCount(0)
  await expect(page.getByText('Importing needs a fresh sign-in: your password and a code, or a passkey.')).toBeVisible()

  await signInAsOwner(context)
  await page.goto('/settings/store')
  await section.getByRole('button', { name: 'Import missed orders' }).click()
  await expect(section.getByRole('status')).toContainText(/Imported 1 order: #\d+\./)

  const number = await numberOf(missed.session.id)

  await expect(section.getByRole('status')).toContainText(`Imported 1 order: #${number}.`)
  await expect(section.getByRole('status')).toContainText('1 order of the last 30 days was already here.')
  await expectNoSeriousA11yViolations(page)
  await page.goto('/activity')
  await expect(page.getByRole('table').getByRole('row').filter({ hasText: 'Imported missed store orders' }).first()).toContainText('1 order')
})
