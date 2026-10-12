import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import type { Locale } from '@/i18n/locale'
import { compareNames } from '@/lib/intl'
import type { Theme } from '@/lib/theme'
import { users } from '@/server/db/schema'
import type { Role, Tx } from '@/server/db/with-workspace'

export type Self = { id: string; name: string; email: string; role: Role; locale: Locale; theme: Theme; shortcutsEnabled: boolean; hasTotp: boolean }

/** Whose row a query reads or writes: a session or an actor will do. */
export type Who = { workspaceId: string; userId: string }

/**
 * A user's row by workspace and id. Every sandbox copies the template's user ids, so the workspace is named as in the
 * rest of the data access layer, not left to row-level security alone.
 */
export const isUser = (who: Who) => and(eq(users.workspaceId, who.workspaceId), eq(users.id, who.userId))

/** The user's own row. */
export async function getSelf(tx: Tx, who: Who): Promise<Self | null> {
  const [row] = await tx.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    locale: users.locale,
    theme: users.theme,
    shortcutsEnabled: users.shortcutsEnabled,
    totpSecretEnc: users.totpSecretEnc,
  }).from(users).where(isUser(who))
  if (!row) return null
  const { totpSecretEnc, ...self } = row
  return { ...self, hasTotp: totpSecretEnc !== null }
}

/** The preferences a member carries between users: the language, the theme and the single-key shortcuts. */
export async function updateSelfPreferences(tx: Tx, who: Who, preferences: { locale?: Locale; theme?: Theme; shortcutsEnabled?: boolean }): Promise<void> {
  if (preferences.locale === undefined && preferences.theme === undefined && preferences.shortcutsEnabled === undefined) return
  await tx.update(users).set(preferences).where(isUser(who))
}

export type Member = { id: string; name: string; role: Role; hasTotp: boolean }

/** Members are listed owner first, then by role. */
export const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, manager: 2, viewer: 3 }

/** The active members of the workspace, owner first, then by name. */
export async function listMembers(tx: Tx, workspaceId: string): Promise<Member[]> {
  const rows = await tx.select({ id: users.id, name: users.name, role: users.role, totpSecretEnc: users.totpSecretEnc })
    .from(users).where(and(eq(users.workspaceId, workspaceId), isNull(users.deactivatedAt)))
  return rows
    .map(r => ({ id: r.id, name: r.name, role: r.role, hasTotp: r.totpSecretEnc !== null }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || compareNames(a.name, b.name))
}

export type MemberFactor = { id: string; role: Role; totpSecretEnc: string | null; totpLastStep: number | null; deactivatedAt: Date | null }

/** What a switch needs to know about its target; null when the user is not in this workspace. */
export async function getMemberFactor(tx: Tx, who: Who): Promise<MemberFactor | null> {
  const [row] = await tx.select({ id: users.id, role: users.role, totpSecretEnc: users.totpSecretEnc, totpLastStep: users.totpLastStep, deactivatedAt: users.deactivatedAt })
    .from(users).where(isUser(who))
  return row ?? null
}

/** Locks the user's row until the transaction ends, so two changes to their second factors run one after the other. */
export async function lockSelf(tx: Tx, who: Who): Promise<void> {
  await tx.select({ id: users.id }).from(users).where(isUser(who)).for('update')
}

/** The profile form's save (spec §8.8): only what changed is written; the fields it changed come back. */
export async function updateProfile(
  tx: Tx,
  who: Who,
  profile: { name: string; locale: Locale; theme: Theme; shortcuts: boolean },
): Promise<('name' | 'locale' | 'theme' | 'shortcuts')[] | null> {
  const [current] = await tx.select({ name: users.name, locale: users.locale, theme: users.theme, shortcuts: users.shortcutsEnabled })
    .from(users).where(isUser(who))
  if (!current) return null
  const changed = (['name', 'locale', 'theme', 'shortcuts'] as const).filter(field => current[field] !== profile[field])
  if (changed.length > 0) {
    await tx.update(users).set({ name: profile.name, locale: profile.locale, theme: profile.theme, shortcutsEnabled: profile.shortcuts }).where(isUser(who))
  }
  return changed
}
