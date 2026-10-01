import { COLLECTIONS, PALETTES, POSTERS, PRODUCTS, shippingCents, SIZES, skuOf, unitPriceCents, type PaletteId, type SizeId } from './catalog.ts'
import { stableId } from './ids.ts'
import { DEMO_USERS, EMAIL_DOMAINS, FIRST_NAMES, LAST_NAMES, ORDER_NOTES, PLACES, STREETS, type DemoRole } from './people.ts'
import { between, createRandom, pick, weighted, type Random } from './random.ts'
import { TEMPLATE_EPOCH, TEMPLATE_VERSION } from './version.ts'

export const ORDER_COUNT = 700
export const CUSTOMER_COUNT = 150
export const HISTORY_DAYS = 180
export const FIRST_ORDER_NUMBER = 1001

const HOUR = 3_600_000
const DAY = 24 * HOUR

export type OrderStatus = 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'

export type SeedUser = { id: string; email: string; name: string; role: DemoRole; createdAt: Date }
export type SeedCollection = { id: string; slug: string; name: string; description: string; position: number }
export type SeedImage = { id: string; storagePath: string; width: number; height: number; bytes: number; createdAt: Date }
export type SeedProduct = {
  id: string; slug: string; name: string; collectionId: string; description: string; basePriceCents: number
  status: 'published'; tags: string[]; imageId: string; createdAt: Date; updatedAt: Date
}
export type SeedVariant = { id: string; productId: string; sku: string; size: SizeId; palette: PaletteId; stock: number; lowStockThreshold: number }
export type SeedCustomer = { id: string; email: string; name: string; city: string; country: string; postal: string; createdAt: Date }
export type SeedAddress = { name: string; line1: string; postalCode: string; city: string; country: string }
export type SeedOrder = {
  id: string; number: number; customerId: string; status: OrderStatus; delivery: 'standard' | 'express'
  subtotalCents: number; shippingCents: number; totalCents: number; shippingAddress: SeedAddress; placedAt: Date; updatedAt: Date
}
export type SeedLine = { id: string; orderId: string; variantId: string; sku: string; name: string; unitCents: number; qty: number }
export type SeedEvent = {
  id: string; orderId: string; kind: 'status' | 'note'; fromStatus: OrderStatus | null; toStatus: OrderStatus | null
  note: string | null; actorUserId: string | null; at: Date
}
export type TemplateData = {
  version: number; epoch: Date; users: SeedUser[]; collections: SeedCollection[]; images: SeedImage[]; products: SeedProduct[]
  variants: SeedVariant[]; customers: SeedCustomer[]; orders: SeedOrder[]; lines: SeedLine[]; events: SeedEvent[]
}

// Sunday first. Weekends are quieter, Friday a little busier.
const WEEKDAY_FACTOR = [0.75, 1, 1, 1, 1, 1.05, 0.7] as const
// Orders by hour of the day: a lunchtime and an evening peak.
const HOUR_WEIGHTS = [1, 1, 1, 1, 1, 1, 2, 3, 5, 7, 8, 8, 8, 7, 6, 6, 6, 7, 8, 9, 8, 6, 4, 2] as const

const STATUS_STEPS: Record<OrderStatus, OrderStatus[]> = {
  paid: [],
  processing: ['processing'],
  shipped: ['processing', 'shipped'],
  delivered: ['processing', 'shipped', 'delivered'],
  cancelled: ['cancelled'],
  refunded: ['processing', 'shipped', 'delivered', 'refunded'],
}

function drawDaysAgo(random: Random): number {
  for (;;) {
    const days = Math.floor(random() * HISTORY_DAYS)
    const trend = 1 + 0.6 * (1 - days / HISTORY_DAYS)
    const weekday = new Date(TEMPLATE_EPOCH.getTime() - days * DAY).getUTCDay()
    if (random() * 1.7 < trend * WEEKDAY_FACTOR[weekday]!) return days
  }
}

function drawSecondOfDay(random: Random): number {
  const hour = weighted(random, HOUR_WEIGHTS.map((weight, h) => [h, weight] as const))
  return hour * 3600 + between(random, 0, 3599)
}

function targetStatus(random: Random, ageMs: number): OrderStatus {
  const hours = ageMs / HOUR
  if (hours < 24) return weighted(random, [['paid', 75], ['processing', 25]] as const)
  if (hours < 72) return weighted(random, [['paid', 45], ['processing', 40], ['shipped', 15]] as const)
  if (hours < 240) return weighted(random, [['paid', 8], ['processing', 12], ['shipped', 50], ['delivered', 25], ['cancelled', 5]] as const)
  return weighted(random, [['delivered', 86], ['cancelled', 6], ['refunded', 4], ['shipped', 4]] as const)
}

function stepDelayMs(random: Random, step: OrderStatus): number {
  switch (step) {
    case 'processing': return between(random, 1, 30) * HOUR
    case 'shipped': return between(random, 20, 72) * HOUR
    case 'delivered': return between(random, 2, 6) * DAY
    case 'cancelled': return between(random, 2, 48) * HOUR
    case 'refunded': return between(random, 1, 14) * DAY
    case 'paid': return 0
  }
}

function stockLevel(random: Random): number {
  const bucket = weighted(random, [['out', 7], ['low', 10], ['mid', 33], ['high', 50]] as const)
  if (bucket === 'out') return 0
  if (bucket === 'low') return between(random, 1, 3)
  if (bucket === 'mid') return between(random, 4, 12)
  return between(random, 13, 40)
}

/**
 * The seed of the random stream: the one version 1 drew from. A later version keeps it, so it changes only the rows its
 * own fix touches — version 2 changed the shipping of seven express orders and nothing else.
 */
const SEED = 7936

/** The whole template from one seed. Pure: no clock, no randomness beyond the seed. */
export function generateTemplate(version: number = TEMPLATE_VERSION): TemplateData {
  const random = createRandom(SEED)
  const epoch = TEMPLATE_EPOCH.getTime()
  const longAgo = new Date(epoch - 200 * DAY)

  const users: SeedUser[] = DEMO_USERS.map(u => ({ id: stableId(`user:${u.role}`), email: u.email, name: u.name, role: u.role, createdAt: longAgo }))
  const staff = users.filter(u => u.role === 'admin' || u.role === 'manager')

  const collections: SeedCollection[] = COLLECTIONS.map((c, i) => ({ id: stableId(`collection:${c.slug}`), slug: c.slug, name: c.name, description: c.description, position: i + 1 }))
  const collectionIds = new Map(collections.map(c => [c.slug, c.id]))

  const images: SeedImage[] = PRODUCTS.map(p => {
    const poster = POSTERS[p.slug]!
    return { id: stableId(`image:${p.slug}`), storagePath: `posters/${p.slug}.webp`, width: poster.width, height: poster.height, bytes: poster.bytes, createdAt: longAgo }
  })

  const products: SeedProduct[] = PRODUCTS.map((p, i) => {
    const createdAt = new Date(epoch - (200 - i * 3) * DAY)
    return {
      id: stableId(`product:${p.slug}`), slug: p.slug, name: p.name, collectionId: collectionIds.get(p.collection)!, description: p.description,
      basePriceCents: p.basePriceCents, status: 'published', tags: [...p.tags], imageId: images[i]!.id,
      createdAt, updatedAt: new Date(createdAt.getTime() + between(random, 0, 90) * DAY),
    }
  })

  const variants: SeedVariant[] = []
  const variantMeta = new Map<string, { productName: string; sizeLabel: string; paletteName: string; unitCents: number; productId: string }>()
  PRODUCTS.forEach((p, i) => {
    for (const size of SIZES) {
      for (const palette of p.palettes) {
        const sku = skuOf(p.slug, size.id, palette)
        const id = stableId(`variant:${sku}`)
        variants.push({ id, productId: products[i]!.id, sku, size: size.id, palette, stock: stockLevel(random), lowStockThreshold: 3 })
        variantMeta.set(id, { productName: p.name, sizeLabel: size.label, paletteName: PALETTES[palette], unitCents: unitPriceCents(p, size.id), productId: products[i]!.id })
      }
    }
  })

  const emails = new Set<string>()
  const customers: SeedCustomer[] = Array.from({ length: CUSTOMER_COUNT }, (_, i) => {
    const first = pick(random, FIRST_NAMES)
    const last = pick(random, LAST_NAMES)
    const place = weighted(random, PLACES.map(p => [p, p.weight] as const))
    const local = `${first}.${last.replace(/\s+/g, '')}`.toLowerCase()
    let email = `${local}@${pick(random, EMAIL_DOMAINS)}`
    for (let n = 2; emails.has(email); n++) email = `${local}${n}@${pick(random, EMAIL_DOMAINS)}`
    emails.add(email)
    return { id: stableId(`customer:${i}`), email, name: `${first} ${last}`, city: place.city, country: place.country, postal: place.postal, createdAt: new Date(epoch) }
  })

  const drafts = Array.from({ length: ORDER_COUNT }, () => ({
    placedAt: epoch - drawDaysAgo(random) * DAY - drawSecondOfDay(random) * 1000,
    customer: customers[Math.floor(random() ** 1.7 * CUSTOMER_COUNT)]!,
  })).sort((a, b) => a.placedAt - b.placedAt)
  // The newest order is minutes old in a fresh sandbox; moving it forward keeps the order of the list.
  const newest = drafts[drafts.length - 1]!
  newest.placedAt = Math.max(newest.placedAt, epoch - 20 * 60_000)

  const orders: SeedOrder[] = []
  const lines: SeedLine[] = []
  let events: SeedEvent[] = []
  drafts.forEach((draft, i) => {
    const number = FIRST_ORDER_NUMBER + i
    const orderId = stableId(`order:${number}`)
    const lineCount = weighted(random, [[1, 62], [2, 28], [3, 10]])
    const chosen: SeedVariant[] = []
    while (chosen.length < lineCount) {
      const variant = pick(random, variants)
      if (!chosen.some(v => v.productId === variant.productId)) chosen.push(variant)
    }
    let subtotal = 0
    chosen.forEach((variant, n) => {
      const meta = variantMeta.get(variant.id)!
      const qty = weighted(random, [[1, 88], [2, 12]])
      subtotal += meta.unitCents * qty
      lines.push({ id: stableId(`line:${number}:${n}`), orderId, variantId: variant.id, sku: variant.sku, name: `${meta.productName} · ${meta.sizeLabel} · ${meta.paletteName}`, unitCents: meta.unitCents, qty })
    })
    const delivery = weighted(random, [['standard', 82], ['express', 18]] as const)
    const shipping = shippingCents(subtotal, delivery)

    const history: SeedEvent[] = [{ id: stableId(`event:${number}:0`), orderId, kind: 'status', fromStatus: null, toStatus: 'paid', note: null, actorUserId: null, at: new Date(draft.placedAt) }]
    let status: OrderStatus = 'paid'
    let at = draft.placedAt
    for (const step of STATUS_STEPS[targetStatus(random, epoch - draft.placedAt)]) {
      at += stepDelayMs(random, step)
      if (at > epoch) break
      history.push({ id: stableId(`event:${number}:${history.length}`), orderId, kind: 'status', fromStatus: status, toStatus: step, note: null, actorUserId: pick(random, staff).id, at: new Date(at) })
      status = step
    }
    const last = history[history.length - 1]!.at.getTime()
    if (random() < 0.08) {
      history.push({ id: stableId(`event:${number}:note`), orderId, kind: 'note', fromStatus: null, toStatus: null, note: pick(random, ORDER_NOTES), actorUserId: pick(random, staff).id, at: new Date(between(random, draft.placedAt, last)) })
    }
    events.push(...history)

    orders.push({
      id: orderId, number, customerId: draft.customer.id, status, delivery, subtotalCents: subtotal, shippingCents: shipping, totalCents: subtotal + shipping,
      shippingAddress: { name: draft.customer.name, line1: `${between(random, 1, 180)} ${pick(random, STREETS)}`, postalCode: draft.customer.postal, city: draft.customer.city, country: draft.customer.country },
      placedAt: new Date(draft.placedAt), updatedAt: new Date(last),
    })
  })

  // The overview always has work waiting: at least a dozen recent orders stay in "paid".
  const dropped = new Set<string>()
  let paid = orders.filter(o => o.status === 'paid').length
  for (let i = orders.length - 1; i >= 0 && paid < 12; i--) {
    const o = orders[i]!
    if (o.status === 'paid' || epoch - o.placedAt.getTime() >= 3 * DAY) continue
    for (const e of events) if (e.orderId === o.id && e.kind === 'status' && e.fromStatus !== null) dropped.add(e.id)
    o.status = 'paid'
    o.updatedAt = new Date(o.placedAt)
    paid++
  }
  events = events.filter(e => !dropped.has(e.id))

  const firstOrder = new Map<string, number>()
  for (const o of orders) firstOrder.set(o.customerId, Math.min(firstOrder.get(o.customerId) ?? Infinity, o.placedAt.getTime()))
  for (const c of customers) {
    const first = firstOrder.get(c.id)
    c.createdAt = new Date(first === undefined ? epoch - between(random, 1, HISTORY_DAYS) * DAY : first - between(random, 0, 3) * DAY)
  }

  return { version, epoch: TEMPLATE_EPOCH, users, collections, images, products, variants, customers, orders, lines, events }
}
