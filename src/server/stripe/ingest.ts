import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { createTranslator } from 'next-intl'
import type { Pool } from 'pg'
import { parseLocale, type Locale } from '@/i18n/locale'
import { variantLabel } from '@/lib/catalog'
import type { IncomingOrder } from '@/lib/stripe/checkout'
import { ownerWorkspaceId } from '@/server/auth/owner'
import { notify } from '@/server/dal/notifications'
import { getPool } from '@/server/db/pool'
import { customers, orderEvents, orderLines, orders, products, productVariants, stripeEvents, users } from '@/server/db/schema'
import { withWorkspace, type Tx } from '@/server/db/with-workspace'
import { log } from '@/server/log'
// The dictionaries live outside src; the ingest runs without a request to take a language from.
// eslint-disable-next-line no-restricted-imports
import en from '../../../messages/en.json'
// eslint-disable-next-line no-restricted-imports
import ru from '../../../messages/ru.json'

export type IngestResult = { status: 'created'; orderId: string; number: number } | { status: 'duplicate' }

/** The name of a customer Stripe gave none for; a later order with a name leaves the customer as they are. */
const NO_NAME = 'Customer'

class Duplicate extends Error {}

type Variant = { id: string; sku: string; size: string; palette: string; stock: number; threshold: number; productId: string; product: string }

async function customerFor(tx: Tx, workspaceId: string, order: IncomingOrder): Promise<string> {
  const found = () => tx.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.workspaceId, workspaceId), sql`lower(${customers.email}) = lower(${order.email})`)).limit(1)
  const [existing] = await found()
  if (existing) return existing.id
  // Two orders of a new customer at once: the second insert meets the first one's row and reads it.
  await tx.execute(sql`
    insert into fa.customers (workspace_id, email, name, city, country)
    values (${workspaceId}, ${order.email}, ${order.name ?? NO_NAME}, ${order.city}, ${order.country})
    on conflict (workspace_id, lower(email)) do nothing`)
  return (await found())[0]!.id
}

async function nextOrderNumber(tx: Tx, workspaceId: string): Promise<number> {
  const { rows } = await tx.execute<{ number: number }>(sql`
    update fa.workspace_counters set next_order_number = next_order_number + 1
    where workspace_id = ${workspaceId} returning next_order_number - 1 as number`)
  return rows[0]!.number
}

/** The matched variants, locked so two orders of the same poster take stock one after the other, with their products' names. */
async function lockVariants(tx: Tx, workspaceId: string, skus: string[]): Promise<Map<string, Variant>> {
  if (skus.length === 0) return new Map()
  const locked = await tx
    .select({
      id: productVariants.id, sku: productVariants.sku, size: productVariants.size, palette: productVariants.palette,
      stock: productVariants.stock, threshold: productVariants.lowStockThreshold, productId: productVariants.productId,
    })
    .from(productVariants)
    .where(and(eq(productVariants.workspaceId, workspaceId), inArray(productVariants.sku, skus)))
    .orderBy(productVariants.id)
    .for('update')
  if (locked.length === 0) return new Map()
  const names = await tx.select({ id: products.id, name: products.name }).from(products)
    .where(and(eq(products.workspaceId, workspaceId), inArray(products.id, [...new Set(locked.map(v => v.productId))])))
  const productName = new Map(names.map(p => [p.id, p.name]))
  return new Map(locked.map(v => [v.sku, { ...v, product: productName.get(v.productId) ?? v.sku }]))
}

async function ownerLocale(tx: Tx, workspaceId: string): Promise<Locale> {
  const [owner] = await tx.select({ locale: users.locale }).from(users).where(and(eq(users.workspaceId, workspaceId), eq(users.role, 'owner'))).limit(1)
  return parseLocale(owner?.locale)
}

/**
 * One paid store order into the owner workspace (spec §7.1, §7.2), in one transaction: the event, the customer,
 * the order with its lines and first status, the stock the lines take and the notifications. A repeat — the same
 * event, or a session already kept through the import — changes nothing.
 */
export async function ingestOrder(order: IncomingOrder, options: { eventId: string | null }, pool: Pool = getPool()): Promise<IngestResult> {
  const workspaceId = await ownerWorkspaceId(pool)
  try {
    const result = await withWorkspace({ workspaceId, userId: null, role: 'system' }, async tx => {
      if (options.eventId) {
        // A second delivery of the same event waits here until the first one commits, then finds its row.
        const recorded = await tx.insert(stripeEvents).values({ eventId: options.eventId, outcome: 'order' }).onConflictDoNothing().returning({ id: stripeEvents.eventId })
        if (recorded.length === 0) throw new Duplicate()
      }
      const [seen] = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.workspaceId, workspaceId), eq(orders.stripeSessionId, order.sessionId))).limit(1)
      if (seen) throw new Duplicate()

      const customerId = await customerFor(tx, workspaceId, order)
      const number = await nextOrderNumber(tx, workspaceId)
      const [created] = await tx.insert(orders).values({
        workspaceId, number, customerId, status: 'paid', source: 'stripe', stripeSessionId: order.sessionId, externalRef: order.externalRef,
        delivery: order.delivery, subtotalCents: order.subtotalCents, shippingCents: order.shippingCents, totalCents: order.totalCents,
        placedAt: order.placedAt, updatedAt: order.placedAt,
      }).onConflictDoNothing({ target: [orders.workspaceId, orders.stripeSessionId] }).returning({ id: orders.id })
      // The import and a webhook delivery of the same session at once: the second waits for the first and stops here.
      if (!created) throw new Duplicate()

      const variants = await lockVariants(tx, workspaceId, [...new Set(order.lines.flatMap(line => line.variant ? [line.variant.sku] : []))])
      await tx.insert(orderLines).values(order.lines.map(line => {
        const variant = line.variant ? variants.get(line.variant.sku) : undefined
        return { workspaceId, orderId: created.id, variantId: variant?.id ?? null, sku: variant?.sku ?? null, name: line.name, unitCents: line.unitCents, qty: line.qty, unmatched: !variant }
      }))
      await tx.insert(orderEvents).values({ workspaceId, orderId: created.id, kind: 'status', fromStatus: null, toStatus: 'paid', actorUserId: null, at: order.placedAt })

      const sold = new Map<string, number>()
      for (const line of order.lines) if (line.variant && variants.has(line.variant.sku)) sold.set(line.variant.sku, (sold.get(line.variant.sku) ?? 0) + line.qty)
      const oversold: { label: string; count: number }[] = []
      for (const [sku, qty] of sold) {
        const variant = variants.get(sku)!
        const stock = Math.max(variant.stock - qty, 0)
        const short = Math.max(qty - variant.stock, 0)
        await tx.update(productVariants).set({ stock }).where(and(eq(productVariants.workspaceId, workspaceId), eq(productVariants.id, variant.id)))
        if (short > 0) oversold.push({ label: `${variant.product} · ${variantLabel(variant.size, variant.palette)}`, count: short })
        // "Low stock" when this sale takes the variant across its threshold from above, or sells more than there was.
        if (short > 0 || (variant.stock > variant.threshold && stock <= variant.threshold)) {
          await notify(tx, workspaceId, {
            userId: null,
            kind: 'stock.low',
            payload: {
              productId: variant.productId, product: variant.product, size: variant.size, palette: variant.palette, stock, threshold: variant.threshold,
              ...(short > 0 ? { oversold: short } : {}),
            },
          })
        }
      }
      if (oversold.length > 0) {
        const locale = await ownerLocale(tx, workspaceId)
        const t = createTranslator({ locale, messages: locale === 'ru' ? ru : en, namespace: 'ingest' })
        await tx.insert(orderEvents).values({
          workspaceId, orderId: created.id, kind: 'note', note: oversold.map(o => t('oversold', { line: o.label, count: o.count })).join('\n'), actorUserId: null, at: order.placedAt,
        })
      }
      const [customer] = await tx.select({ name: customers.name }).from(customers).where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, customerId)))
      await notify(tx, workspaceId, {
        userId: null,
        kind: 'order.created',
        payload: { orderId: created.id, number, customer: customer!.name, totalCents: order.totalCents },
      })
      return { status: 'created' as const, orderId: created.id, number }
    }, pool)
    log.info({ event: 'stripe.order', number: result.number, lines: order.lines.length })
    return result
  } catch (error) {
    if (error instanceof Duplicate) return { status: 'duplicate' }
    throw error
  }
}
