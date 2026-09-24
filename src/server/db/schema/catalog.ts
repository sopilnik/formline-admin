import { integer, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { fa } from '@/server/db/schema/global'

const ts = (name: string) => timestamp(name, { withTimezone: true })

export const collections = fa.table('collections', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  position: integer('position').notNull().default(0),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const images = fa.table('images', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  storagePath: text('storage_path').notNull(),
  source: text('source', { enum: ['static', 'upload'] }).notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const products = fa.table('products', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  collectionId: uuid('collection_id').notNull(),
  description: text('description').notNull().default(''),
  basePriceCents: integer('base_price_cents').notNull(),
  status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull(),
  tags: text('tags').array().notNull().default([]),
  imageId: uuid('image_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const productVariants = fa.table('product_variants', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  productId: uuid('product_id').notNull(),
  sku: text('sku').notNull(),
  size: text('size', { enum: ['a3', 'a2', 'a1'] }).notNull(),
  palette: text('palette').notNull(),
  priceOverrideCents: integer('price_override_cents'),
  stock: integer('stock').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(3),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])
