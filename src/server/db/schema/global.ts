import { integer, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const fa = pgSchema('fa')

export const workspaceKind = fa.enum('workspace_kind', ['template', 'owner', 'sandbox'])
export const roleEnum = fa.enum('role', ['owner', 'admin', 'manager', 'viewer'])

const ts = (name: string) => timestamp(name, { withTimezone: true })

export const workspaces = fa.table('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: workspaceKind('kind').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastActiveAt: ts('last_active_at').notNull().defaultNow(),
  expiresAt: ts('expires_at'),
  creatorIpHash: text('creator_ip_hash'),
  templateVersion: integer('template_version'),
})

export const rateLimits = fa.table('rate_limits', {
  purpose: text('purpose').notNull(),
  subject: text('subject').notNull(),
  windowStart: ts('window_start').notNull(),
  count: integer('count').notNull().default(0),
}, t => [primaryKey({ columns: [t.purpose, t.subject, t.windowStart] })])

export const stripeEvents = fa.table('stripe_events', {
  eventId: text('event_id').primaryKey(),
  receivedAt: ts('received_at').notNull().defaultNow(),
  outcome: text('outcome').notNull(),
})

export const usedChallenges = fa.table('used_challenges', {
  challengeHash: text('challenge_hash').primaryKey(),
  usedAt: ts('used_at').notNull().defaultNow(),
})

export const pendingMediaDeletions = fa.table('pending_media_deletions', {
  storagePath: text('storage_path').primaryKey(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
})

export const ownerRecoveryCodes = fa.table('owner_recovery_codes', {
  codeHash: text('code_hash').primaryKey(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
})
