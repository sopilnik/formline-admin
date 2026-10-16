import 'server-only'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { createTranslator } from 'next-intl'
import type { Pool } from 'pg'
import { parseLocale, type Locale } from '@/i18n/locale'
import { variantLabel } from '@/lib/catalog'
import { fitNote } from '@/lib/orders/note'
import type { IncomingOrder } from '@/lib/stripe/checkout'
import { ownerWorkspaceId } from '@/server/auth/owner'
import { notify } from '@/server/dal/notifications'
import { getPool } from '@/server/db/pool'
import { customers, orderEvents, orderLines, orders, products, productVariants, stripeEvents, users } from '@/server/db/schema'
import { withWorkspaces, type Tx } from '@/server/db/with-workspace'
import { log } from '@/server/log'
import { pseudonymFor, type Pseudonym } from '@/server/stripe/pseudonym'
// The dictionaries live outside src; the ingest runs without a request to take a language from.
import en from '@messages/en.json'
import ru from '@messages/ru.json'

export type IngestResult = { status: 'created'; orderId: string; number: number } | { status: 'duplicate' }

/** The name of a customer Stripe gave none for; a later order with a name leaves the customer as they are. */
const NO_NAME = 'Customer'

/**
 * A repeat of an order already kept. It is thrown inside the transaction rather than returned, so the rollback takes
 * back what the transaction wrote so far, the recorded event above all, and a repeat leaves no trace.
 */
class Duplicate extends Error {}

type Variant = { id: string; sku: string; size: string; palette: string; stock: number; threshold: number; productId: string; product: string }
type Created = { orderId: string; number: number; customerId: string }
type Oversold = { label: string; count: number }

let templateWorkspace: string | undefined

/** The template never changes once the migrations ran, so its id is read once per process. */
async function templateWorkspaceId(pool: Pool): Promise<string> {
  if (templateWorkspace) {
    return templateWorkspace
  }

  const { rows } = await pool.query<{ id: string | null }>('select fa.template_workspace_id() as id')
  const id = rows[0]?.id

  if (!id) {
    throw new Error('the template workspace does not exist; run the migrations')
  }

  templateWorkspace = id

  return id
}

type FreshCustomer = { email: string; name: string; city: string | null; country: string | null; pseudonymised: boolean }

/**
 * The customer with one of the emails, or a new one. An owner-workspace customer the daily job has pseudonymised is
 * found by the pseudonym's email, so a returning customer stays one customer.
 */
async function customerFor(
  tx: Tx,
  workspaceId: string,
  { emails, fresh }: { emails: string[]; fresh: FreshCustomer },
): Promise<string> {
  const found = () => tx.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.workspaceId, workspaceId), or(...emails.map(email => sql`lower(${customers.email}) = lower(${email})`))))
    .limit(1)
  const [existing] = await found()

  if (existing) {
    return existing.id
  }

  // Two orders of a new customer at once: the second insert meets the first one's row and reads it.
  await tx.execute(sql`
    insert into fa.customers (workspace_id, email, name, city, country, pseudonymised_at)
    values (${workspaceId}, ${fresh.email}, ${fresh.name}, ${fresh.city}, ${fresh.country}, ${fresh.pseudonymised ? sql`now()` : null})
    on conflict (workspace_id, lower(email)) do nothing`)

  const [made] = await found()

  if (!made) {
    throw new Error(`workspace ${workspaceId} neither has nor took the order's customer`)
  }

  return made.id
}

/** The workspace's next order number; every workspace gets its counter row with the workspace, so a missing one is a broken schema. */
async function nextOrderNumber(tx: Tx, workspaceId: string): Promise<number> {
  const { rows } = await tx.execute<{ number: number }>(sql`
    update fa.workspace_counters set next_order_number = next_order_number + 1
    where workspace_id = ${workspaceId} returning next_order_number - 1 as number`)
  const [row] = rows

  if (!row) {
    throw new Error(`workspace ${workspaceId} has no order counter in fa.workspace_counters`)
  }

  return row.number
}

/** The matched variants, locked so two orders of the same poster take stock one after the other, with their products' names. */
async function lockVariants(tx: Tx, workspaceId: string, skus: string[]): Promise<Map<string, Variant>> {
  if (skus.length === 0) {
    return new Map()
  }

  const locked = await tx
    .select({
      id: productVariants.id, sku: productVariants.sku, size: productVariants.size, palette: productVariants.palette,
      stock: productVariants.stock, threshold: productVariants.lowStockThreshold, productId: productVariants.productId,
    })
    .from(productVariants)
    .where(and(eq(productVariants.workspaceId, workspaceId), inArray(productVariants.sku, skus)))
    .orderBy(productVariants.id)
    .for('update')

  if (locked.length === 0) {
    return new Map()
  }

  const names = await tx.select({ id: products.id, name: products.name }).from(products)
    .where(and(eq(products.workspaceId, workspaceId), inArray(products.id, [...new Set(locked.map(v => v.productId))])))
  const productName = new Map(names.map(p => [p.id, p.name]))

  return new Map(locked.map(v => [v.sku, { ...v, product: productName.get(v.productId) ?? v.sku }]))
}

async function ownerLocale(tx: Tx, workspaceId: string): Promise<Locale> {
  const [owner] = await tx.select({ locale: users.locale }).from(users).where(and(eq(users.workspaceId, workspaceId), eq(users.role, 'owner'))).limit(1)

  return parseLocale(owner?.locale)
}

const matchedSkus = (order: IncomingOrder): string[] => [...new Set(order.lines.flatMap(line => line.variant ? [line.variant.sku] : []))]

/**
 * The copy every sandbox created afterwards may show: the pseudonymised customer and only the order's
 * lines, amounts, delivery, status and time — no notes, no later events, no Stripe ids, no store reference. Lines link
 * to the template's variants by SKU; the template's stock does not move.
 */
async function writeCopy(
  tx: Tx,
  workspaceId: string,
  { order, person }: { order: IncomingOrder; person: Pseudonym },
): Promise<void> {
  const customerId = await customerFor(tx, workspaceId, { emails: [person.email], fresh: { ...person, pseudonymised: true } })
  const number = await nextOrderNumber(tx, workspaceId)
  const [copy] = await tx.insert(orders).values({
    workspaceId, number, customerId, status: 'paid', source: 'stripe', delivery: order.delivery,
    subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, totalCents: order.totalCents, placedAt: order.placedAt, updatedAt: order.placedAt,
  }).returning({ id: orders.id })
  const skus = matchedSkus(order)
  const variants = skus.length === 0 ? [] : await tx.select({ id: productVariants.id, sku: productVariants.sku }).from(productVariants)
    .where(and(eq(productVariants.workspaceId, workspaceId), inArray(productVariants.sku, skus)))
  const bySku = new Map(variants.map(v => [v.sku, v.id]))

  await tx.insert(orderLines).values(order.lines.map(line => {
    const variantId = line.variant ? bySku.get(line.variant.sku) : undefined

    return { workspaceId, orderId: copy!.id, variantId: variantId ?? null, sku: variantId ? line.variant!.sku : null, name: line.name, unitCents: line.unitCents, qty: line.qty, unmatched: !variantId }
  }))

  await tx.insert(orderEvents).values({ workspaceId, orderId: copy!.id, kind: 'status', fromStatus: null, toStatus: 'paid', actorUserId: null, at: order.placedAt })
}

/** Keeps the event and the session once each: a repeat throws Duplicate before anything is written. */
async function claim(
  tx: Tx,
  owner: string,
  { order, eventId }: { order: IncomingOrder; eventId: string | null },
): Promise<void> {
  if (eventId) {
    // A second delivery of the same event waits here until the first one commits, then finds its row.
    const recorded = await tx.insert(stripeEvents).values({ eventId, outcome: 'order' }).onConflictDoNothing().returning({ id: stripeEvents.eventId })

    if (recorded.length === 0) {
      throw new Duplicate()
    }
  }

  const [seen] = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.workspaceId, owner), eq(orders.stripeSessionId, order.sessionId))).limit(1)

  if (seen) {
    throw new Duplicate()
  }
}

/** The owner's customer and the order itself, under the next number. */
async function writeOrder(
  tx: Tx,
  owner: string,
  { order, person }: { order: IncomingOrder; person: Pseudonym },
): Promise<Created> {
  const customerId = await customerFor(tx, owner, {
    emails: [order.email, person.email],
    fresh: { email: order.email, name: order.name ?? NO_NAME, city: order.city, country: order.country, pseudonymised: false },
  })
  const number = await nextOrderNumber(tx, owner)
  const [created] = await tx.insert(orders).values({
    workspaceId: owner, number, customerId, status: 'paid', source: 'stripe', stripeSessionId: order.sessionId, externalRef: order.externalRef,
    delivery: order.delivery, subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, totalCents: order.totalCents,
    placedAt: order.placedAt, updatedAt: order.placedAt,
  }).onConflictDoNothing({ target: [orders.workspaceId, orders.stripeSessionId] }).returning({ id: orders.id })

  // The import and a webhook delivery of the same session at once: the second waits for the first and stops here.
  if (!created) {
    throw new Duplicate()
  }

  return { orderId: created.id, number, customerId }
}

/** The order's lines, matched to the locked variants where their names allow, and its first status. */
async function writeLines(
  tx: Tx,
  owner: string,
  { orderId, order, variants }: { orderId: string; order: IncomingOrder; variants: Map<string, Variant> },
): Promise<void> {
  await tx.insert(orderLines).values(order.lines.map(line => {
    const variant = line.variant ? variants.get(line.variant.sku) : undefined

    return { workspaceId: owner, orderId, variantId: variant?.id ?? null, sku: variant?.sku ?? null, name: line.name, unitCents: line.unitCents, qty: line.qty, unmatched: !variant }
  }))

  await tx.insert(orderEvents).values({ workspaceId: owner, orderId, kind: 'status', fromStatus: null, toStatus: 'paid', actorUserId: null, at: order.placedAt })
}

/** Takes the stock the matched lines sold, never below zero, says "Low stock" where it should, and returns what was oversold. */
async function takeStock(
  tx: Tx,
  owner: string,
  { order, variants }: { order: IncomingOrder; variants: Map<string, Variant> },
): Promise<Oversold[]> {
  const sold = new Map<string, number>()

  for (const line of order.lines) {
    if (line.variant && variants.has(line.variant.sku)) {
      sold.set(line.variant.sku, (sold.get(line.variant.sku) ?? 0) + line.qty)
    }
  }

  const oversold: Oversold[] = []

  for (const [sku, qty] of sold) {
    const variant = variants.get(sku)!
    const stock = Math.max(variant.stock - qty, 0)
    const short = Math.max(qty - variant.stock, 0)

    await tx.update(productVariants).set({ stock }).where(and(eq(productVariants.workspaceId, owner), eq(productVariants.id, variant.id)))

    if (short > 0) {
      oversold.push({ label: `${variant.product} · ${variantLabel(variant.size, variant.palette)}`, count: short })
    }
    // "Low stock" when this sale takes the variant across its threshold from above, or sells more than there was.
    if (short > 0 || (variant.stock > variant.threshold && stock <= variant.threshold)) {
      await notify(tx, owner, {
        userId: null,
        kind: 'stock.low',
        payload: {
          productId: variant.productId, product: variant.product, size: variant.size, palette: variant.palette, stock, threshold: variant.threshold,
          ...(short > 0 ? { oversold: short } : {}),
        },
      })
    }
  }

  return oversold
}

/**
 * A note on the order of what was oversold, in the owner's language. An order with more oversold variants than one
 * note holds lists the first of them and counts the rest.
 */
async function writeOversoldNote(
  tx: Tx,
  owner: string,
  { orderId, order, oversold }: { orderId: string; order: IncomingOrder; oversold: Oversold[] },
): Promise<void> {
  if (oversold.length === 0) {
    return
  }

  const locale = await ownerLocale(tx, owner)
  const t = createTranslator({ locale, messages: locale === 'ru' ? ru : en, namespace: 'ingest' })
  const lines = oversold.map(o => t('oversold', { line: o.label, count: o.count }))

  // A moment after the status event, so the history lists the payment first; with the same time their order was random.
  await tx.insert(orderEvents).values({
    workspaceId: owner, orderId, kind: 'note', note: fitNote(lines, left => t('oversoldMore', { count: left })), actorUserId: null,
    at: new Date(order.placedAt.getTime() + 1),
  })
}

/** "New order" for everybody in the owner workspace. */
async function notifyOrder(
  tx: Tx,
  owner: string,
  { created, totalCents }: { created: Created; totalCents: number },
): Promise<void> {
  const [customer] = await tx.select({ name: customers.name }).from(customers).where(and(eq(customers.workspaceId, owner), eq(customers.id, created.customerId)))

  await notify(tx, owner, {
    userId: null,
    kind: 'order.created',
    payload: { orderId: created.orderId, number: created.number, customer: customer!.name, totalCents },
  })
}

/**
 * One paid store order, in one transaction: the event, the owner's customer, order, lines, first status,
 * the stock the lines take and the notifications, then the pseudonymised copy in the template — all of it or nothing, so
 * a Stripe retry redoes the whole. A repeat — the same event, or a session already kept
 * through the import — changes nothing.
 */
export async function ingestOrder(order: IncomingOrder, options: { eventId: string | null; pseudonymKey: string }, pool: Pool = getPool()): Promise<IngestResult> {
  const owner = await ownerWorkspaceId(pool)
  const template = await templateWorkspaceId(pool)
  const person = pseudonymFor(order.email, options.pseudonymKey)

  try {
    const result = await withWorkspaces(async enter => {
      const tx = await enter({ workspaceId: owner, userId: null, role: 'system' })

      await claim(tx, owner, { order, eventId: options.eventId })

      const created = await writeOrder(tx, owner, { order, person })
      const variants = await lockVariants(tx, owner, matchedSkus(order))

      await writeLines(tx, owner, { orderId: created.orderId, order, variants })

      const oversold = await takeStock(tx, owner, { order, variants })

      await writeOversoldNote(tx, owner, { orderId: created.orderId, order, oversold })
      await notifyOrder(tx, owner, { created, totalCents: order.totalCents })

      await writeCopy(await enter({ workspaceId: template, userId: null, role: 'system' }), template, { order, person })

      return { status: 'created' as const, orderId: created.orderId, number: created.number }
    }, pool)

    log.info({ event: 'stripe.order', number: result.number, lines: order.lines.length })

    return result
  } catch (error) {
    if (error instanceof Duplicate) {
      return { status: 'duplicate' }
    }

    throw error
  }
}
