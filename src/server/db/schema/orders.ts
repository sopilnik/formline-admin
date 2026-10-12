import { boolean, integer, jsonb, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { fa, ts } from '@/server/db/schema/global'


export const customers = fa.table('customers', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  city: text('city'),
  country: text('country'),
  notes: text('notes').notNull().default(''),
  pseudonymisedAt: ts('pseudonymised_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const workspaceCounters = fa.table('workspace_counters', {
  workspaceId: uuid('workspace_id').primaryKey(),
  nextOrderNumber: integer('next_order_number').notNull().default(1001),
})

export const orders = fa.table('orders', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  number: integer('number').notNull(),
  customerId: uuid('customer_id').notNull(),
  status: text('status', { enum: ['paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] }).notNull(),
  source: text('source', { enum: ['seed', 'stripe'] }).notNull(),
  stripeSessionId: text('stripe_session_id'),
  externalRef: text('external_ref'),
  delivery: text('delivery', { enum: ['standard', 'express'] }).notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  shippingCents: integer('shipping_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  shippingAddress: jsonb('shipping_address'),
  placedAt: ts('placed_at').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const orderLines = fa.table('order_lines', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  variantId: uuid('variant_id'),
  sku: text('sku'),
  name: text('name').notNull(),
  unitCents: integer('unit_cents').notNull(),
  qty: integer('qty').notNull(),
  unmatched: boolean('unmatched').notNull().default(false),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const orderEvents = fa.table('order_events', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  orderId: uuid('order_id').notNull(),
  kind: text('kind', { enum: ['status', 'note'] }).notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  note: text('note'),
  actorUserId: uuid('actor_user_id'),
  at: ts('at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])
