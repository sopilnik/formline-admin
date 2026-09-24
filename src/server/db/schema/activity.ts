import { integer, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { fa } from '@/server/db/schema/global'

const ts = (name: string) => timestamp(name, { withTimezone: true })

export const activityLog = fa.table('activity_log', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: jsonb('details').notNull().default({}),
  ipHash: text('ip_hash'),
  at: ts('at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const notifications = fa.table('notifications', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  userId: uuid('user_id'),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const notificationReads = fa.table('notification_reads', {
  workspaceId: uuid('workspace_id').notNull(),
  notificationId: uuid('notification_id').notNull(),
  userId: uuid('user_id').notNull(),
  readAt: ts('read_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.notificationId, t.userId] })])

export const outboxEmails = fa.table('outbox_emails', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  toAddress: text('to_address').notNull(),
  template: text('template').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const storeSettings = fa.table('store_settings', {
  workspaceId: uuid('workspace_id').primaryKey(),
  storeName: text('store_name').notNull().default('Formline'),
  supportEmail: text('support_email').notNull().default('support@formline.example'),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  lowStockDefault: integer('low_stock_default').notNull().default(3),
})
