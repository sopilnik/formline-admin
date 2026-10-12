import { bigint, boolean, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { fa, roleEnum, ts } from '@/server/db/schema/global'


export const users = fa.table('users', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull(),
  passwordHash: text('password_hash'),
  totpSecretEnc: text('totp_secret_enc'),
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  locale: text('locale', { enum: ['en', 'ru'] }).notNull().default('en'),
  theme: text('theme', { enum: ['system', 'light', 'dark'] }).notNull().default('system'),
  shortcutsEnabled: boolean('shortcuts_enabled').notNull().default(true),
  deactivatedAt: ts('deactivated_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const sessions = fa.table('sessions', {
  workspaceId: uuid('workspace_id').notNull(),
  id: text('id').notNull(),
  userId: uuid('user_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  secondFactorVerified: boolean('second_factor_verified').notNull().default(false),
  reauthAt: ts('reauth_at'),
  userAgentSummary: text('user_agent_summary'),
  ipHash: text('ip_hash'),
  signInId: uuid('sign_in_id').notNull().defaultRandom(),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const passkeys = fa.table('passkeys', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  userId: uuid('user_id').notNull(),
  credentialId: text('credential_id').notNull(),
  publicKey: text('public_key').notNull(),
  counter: bigint('counter', { mode: 'number' }).notNull().default(0),
  transports: text('transports').array().notNull().default([]),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastUsedAt: ts('last_used_at'),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const recoveryCodes = fa.table('recovery_codes', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  userId: uuid('user_id').notNull(),
  codeHash: text('code_hash').notNull(),
  usedAt: ts('used_at'),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])

export const invitations = fa.table('invitations', {
  workspaceId: uuid('workspace_id').notNull(),
  id: uuid('id').notNull().defaultRandom(),
  email: text('email').notNull(),
  role: roleEnum('role').notNull(),
  tokenHash: text('token_hash').notNull(),
  token: text('token'),
  invitedBy: uuid('invited_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  revokedAt: ts('revoked_at'),
}, t => [primaryKey({ columns: [t.workspaceId, t.id] })])
