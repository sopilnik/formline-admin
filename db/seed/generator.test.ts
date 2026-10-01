import { describe, expect, it } from 'vitest'
import { PRODUCTS, SIZES } from './catalog.ts'
import { CUSTOMER_COUNT, FIRST_ORDER_NUMBER, generateTemplate, HISTORY_DAYS, ORDER_COUNT } from './generator.ts'
import { TEMPLATE_EPOCH } from './version.ts'

const DAY = 86_400_000
const data = generateTemplate()
const epoch = TEMPLATE_EPOCH.getTime()

describe('generateTemplate', () => {
  it('is deterministic, and a new version draws from the random stream of the first', () => {
    expect(JSON.stringify(generateTemplate())).toBe(JSON.stringify(data))
    expect({ ...generateTemplate(1), version: data.version }).toEqual(data)
  })

  it('has the agreed volumes and one demo user per role', () => {
    expect(data.users.map(u => u.role).sort()).toEqual(['admin', 'manager', 'owner', 'viewer'])
    expect(data.users.find(u => u.role === 'owner')?.name).toBe('Dana Ortiz')
    expect(data.collections).toHaveLength(4)
    expect(data.images).toHaveLength(16)
    expect(data.products).toHaveLength(16)
    expect(data.variants).toHaveLength(PRODUCTS.reduce((n, p) => n + p.palettes.length * SIZES.length, 0))
    expect(data.customers).toHaveLength(CUSTOMER_COUNT)
    expect(data.orders).toHaveLength(ORDER_COUNT)
  })

  it('keeps every reference inside the template and every id unique', () => {
    const ids = [...data.users, ...data.collections, ...data.images, ...data.products, ...data.variants, ...data.customers, ...data.orders, ...data.lines, ...data.events].map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    const collections = new Set(data.collections.map(c => c.id))
    const images = new Set(data.images.map(i => i.id))
    const products = new Set(data.products.map(p => p.id))
    const variants = new Map(data.variants.map(v => [v.id, v]))
    const customers = new Set(data.customers.map(c => c.id))
    const orders = new Set(data.orders.map(o => o.id))
    const staff = new Set(data.users.map(u => u.id))
    for (const p of data.products) {
      expect(collections.has(p.collectionId)).toBe(true)
      expect(images.has(p.imageId)).toBe(true)
    }
    for (const v of data.variants) expect(products.has(v.productId)).toBe(true)
    for (const o of data.orders) expect(customers.has(o.customerId)).toBe(true)
    for (const l of data.lines) {
      expect(orders.has(l.orderId)).toBe(true)
      expect(variants.get(l.variantId)?.sku).toBe(l.sku)
    }
    for (const e of data.events) {
      expect(orders.has(e.orderId)).toBe(true)
      if (e.actorUserId) expect(staff.has(e.actorUserId)).toBe(true)
    }
    expect(new Set(data.customers.map(c => c.email.toLowerCase())).size).toBe(CUSTOMER_COUNT)
    expect(new Set(data.variants.map(v => v.sku)).size).toBe(data.variants.length)
  })

  it('numbers orders in time order and keeps the money consistent', () => {
    let previous = -Infinity
    data.orders.forEach((o, i) => {
      expect(o.number).toBe(FIRST_ORDER_NUMBER + i)
      expect(o.placedAt.getTime()).toBeGreaterThanOrEqual(previous)
      previous = o.placedAt.getTime()
      const lines = data.lines.filter(l => l.orderId === o.id)
      expect(lines.length).toBeGreaterThanOrEqual(1)
      expect(lines.length).toBeLessThanOrEqual(3)
      const subtotal = lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0)
      expect(o.subtotalCents).toBe(subtotal)
      expect(o.shippingCents).toBe(o.delivery === 'express' ? 1900 : subtotal >= 15_000 ? 0 : 900)
      expect(o.totalCents).toBe(o.subtotalCents + o.shippingCents)
    })
  })

  it('places every order inside the history window with a fresh one near the epoch', () => {
    const times = data.orders.map(o => o.placedAt.getTime())
    expect(Math.min(...times)).toBeGreaterThanOrEqual(epoch - HISTORY_DAYS * DAY)
    expect(Math.max(...times)).toBeLessThanOrEqual(epoch)
    expect(epoch - Math.max(...times)).toBeLessThanOrEqual(30 * 60_000)
    for (const e of data.events) expect(e.at.getTime()).toBeLessThanOrEqual(epoch)
    for (const c of data.customers) expect(c.createdAt.getTime()).toBeLessThanOrEqual(epoch)
  })

  it('has a status mix that leaves work on the overview and a full history behind each order', () => {
    expect(data.orders.filter(o => o.status === 'paid').length).toBeGreaterThanOrEqual(12)
    expect(data.orders.filter(o => o.status === 'delivered').length).toBeGreaterThan(ORDER_COUNT / 2)
    for (const status of ['processing', 'shipped', 'cancelled', 'refunded'] as const) {
      expect(data.orders.some(o => o.status === status), status).toBe(true)
    }
    for (const o of data.orders) {
      const history = data.events.filter(e => e.orderId === o.id && e.kind === 'status').sort((a, b) => a.at.getTime() - b.at.getTime())
      expect(history[0]).toMatchObject({ fromStatus: null, toStatus: 'paid', actorUserId: null })
      expect(history[0]!.at.getTime()).toBe(o.placedAt.getTime())
      expect(history[history.length - 1]!.toStatus).toBe(o.status)
      expect(o.updatedAt.getTime()).toBe(history[history.length - 1]!.at.getTime())
    }
    expect(data.events.some(e => e.kind === 'note')).toBe(true)
  })

  it('leaves some variants sold out and some low on stock', () => {
    expect(data.variants.some(v => v.stock === 0)).toBe(true)
    expect(data.variants.some(v => v.stock > 0 && v.stock <= v.lowStockThreshold)).toBe(true)
    expect(data.variants.every(v => v.stock >= 0 && v.stock <= 40)).toBe(true)
  })
})
