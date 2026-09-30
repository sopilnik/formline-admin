import 'server-only'
import { eq, isNull } from 'drizzle-orm'
import type { Locale } from '@/i18n/locale'
import type { Theme } from '@/lib/theme'
import { users } from '@/server/db/schema'
import type { Role, Tx } from '@/server/db/with-workspace'

export type Self = { id: string; name: string; email: string; role: Role; locale: Locale; theme: Theme; shortcutsEnabled: boolean; hasTotp: boolean }

/** The signed-in user's own row; row-level security scopes the query to the workspace. */
export async function getSelf(tx: Tx, userId: string): Promise<Self | null> {
  const [row] = await tx.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    locale: users.locale,
    theme: users.theme,
    shortcutsEnabled: users.shortcutsEnabled,
    totpSecretEnc: users.totpSecretEnc,
  }).from(users).where(eq(users.id, userId))
  if (!row) return null
  const { totpSecretEnc, ...self } = row
  return { ...self, hasTotp: totpSecretEnc !== null }
}

/** The preferences a member carries between users: the language, the theme and the single-key shortcuts. */
export async function updateSelfPreferences(tx: Tx, userId: string, preferences: { locale?: Locale; theme?: Theme; shortcutsEnabled?: boolean }): Promise<void> {
  if (preferences.locale === undefined && preferences.theme === undefined && preferences.shortcutsEnabled === undefined) return
  await tx.update(users).set(preferences).where(eq(users.id, userId))
}

export type Member = { id: string; name: string; role: Role; hasTotp: boolean }

const ROLE_ORDER: Record<Role, number> = { owner: 0, admin: 1, manager: 2, viewer: 3 }

/** The active members of the current workspace, owner first, then by name. Row-level security scopes the rows. */
export async function listMembers(tx: Tx): Promise<Member[]> {
  const rows = await tx.select({ id: users.id, name: users.name, role: users.role, totpSecretEnc: users.totpSecretEnc })
    .from(users).where(isNull(users.deactivatedAt))
  return rows
    .map(r => ({ id: r.id, name: r.name, role: r.role, hasTotp: r.totpSecretEnc !== null }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
}

export type MemberFactor = { id: string; role: Role; totpSecretEnc: string | null; totpLastStep: number | null; deactivatedAt: Date | null }

/** What a switch needs to know about its target; null when the user is not in this workspace. */
export async function getMemberFactor(tx: Tx, userId: string): Promise<MemberFactor | null> {
  const [row] = await tx.select({ id: users.id, role: users.role, totpSecretEnc: users.totpSecretEnc, totpLastStep: users.totpLastStep, deactivatedAt: users.deactivatedAt })
    .from(users).where(eq(users.id, userId))
  return row ?? null
}

/** The profile form's save (spec §8.8): only what changed is written; the fields it changed come back. */
export async function updateProfile(
  tx: Tx,
  userId: string,
  profile: { name: string; locale: Locale; theme: Theme; shortcuts: boolean },
): Promise<('name' | 'locale' | 'theme' | 'shortcuts')[] | null> {
  const [current] = await tx.select({ name: users.name, locale: users.locale, theme: users.theme, shortcuts: users.shortcutsEnabled })
    .from(users).where(eq(users.id, userId))
  if (!current) return null
  const changed = (['name', 'locale', 'theme', 'shortcuts'] as const).filter(field => current[field] !== profile[field])
  if (changed.length > 0) {
    await tx.update(users).set({ name: profile.name, locale: profile.locale, theme: profile.theme, shortcutsEnabled: profile.shortcuts }).where(eq(users.id, userId))
  }
  return changed
}
