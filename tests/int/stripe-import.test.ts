import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { log } from '@/server/log'
import { importMissedOrders } from '@/server/stripe/import'
import { handleWebhook } from '@/server/stripe/webhook'
import { adminPool, appPool, closeAll } from './db'
import { fakeGateway, keepStoreState, signedEvent, storeSession, TEST_STRIPE } from './stripe'

let admin: pg.Pool
let app: pg.Pool
let restore: () => Promise<void>
const TAG = randomUUID().slice(0, 8)
const DAY = 86_400

const numberOf = async (sessionId: string) =>
  (await admin.query<{ number: number }>("select o.number from fa.orders o join fa.workspaces w on w.id = o.workspace_id where w.kind = 'owner' and o.stripe_session_id = $1", [sessionId])).rows[0]?.number

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  restore = await keepStoreState(admin)
})

afterAll(async () => {
  await restore()
  await closeAll()
})

describe('importing missed store orders', () => {
  it('keeps the paid sessions of 30 days the panel lacks, oldest first, and counts the rest', async () => {
    const now = Math.floor(Date.now() / 1000)
    const delivered = storeSession(TAG, { created: now - 3 * DAY })
    const older = storeSession(TAG, { created: now - 5 * DAY })
    const newer = storeSession(TAG, { created: now - 1 * DAY })
    const unpaid = storeSession(TAG, { created: now - 2 * DAY, payment_status: 'unpaid' })
    const euro = storeSession(TAG, { created: now - 2 * DAY, currency: 'eur' })
    const tooOld = storeSession(TAG, { created: now - 31 * DAY })
    const gateway = fakeGateway([delivered, older, newer, unpaid, euro, tooOld])

    expect((await handleWebhook(signedEvent(delivered.session), { config: TEST_STRIPE, gateway, pool: app })).status).toBe(200)

    const summary = await importMissedOrders({ gateway, pseudonymKey: TEST_STRIPE.pseudonymKey, pool: app })
    const [first, second] = [await numberOf(older.session.id), await numberOf(newer.session.id)]

    expect(summary).toEqual({ imported: [first, second], already: 1, skipped: 2, failed: 0, more: false })
    expect(second).toBe(first! + 1)
    expect(await numberOf(tooOld.session.id)).toBeUndefined()
    expect(await numberOf(unpaid.session.id)).toBeUndefined()

    expect(await importMissedOrders({ gateway, pseudonymKey: TEST_STRIPE.pseudonymKey, pool: app })).toEqual({ imported: [], already: 3, skipped: 2, failed: 0, more: false })
  })

  it('says when Stripe holds more sessions than one import reads', async () => {
    const gateway = { ...fakeGateway([]), completedSessions: async () => ({ sessions: [], more: true }) }

    expect(await importMissedOrders({ gateway, pseudonymKey: TEST_STRIPE.pseudonymKey, pool: app })).toEqual({ imported: [], already: 0, skipped: 0, failed: 0, more: true })
  })

  it('counts a session it could not import, logs its id and goes on with the others', async () => {
    const now = Math.floor(Date.now() / 1000)
    const broken = storeSession(TAG, { created: now - 4 * DAY })
    const kept = storeSession(TAG, { created: now - 2 * DAY })
    const known = fakeGateway([broken, kept])
    const gateway = { ...known, lineItems: async (id: string) => (id === broken.session.id ? Promise.reject(new Error('Stripe timed out')) : known.lineItems(id)) }
    const errors = vi.spyOn(log, 'error')

    try {
      const summary = await importMissedOrders({ gateway, pseudonymKey: TEST_STRIPE.pseudonymKey, pool: app })

      expect(summary).toEqual({ imported: [await numberOf(kept.session.id)], already: 0, skipped: 0, failed: 1, more: false })
      expect(errors).toHaveBeenCalledWith(expect.objectContaining({ event: 'stripe.import_session_failed', sessionId: broken.session.id }))
    } finally {
      errors.mockRestore()
    }
  })
})
