import 'server-only'
import { eq, isNull } from 'drizzle-orm'
import type { Locale } from '@/i18n/locale'
import type { Theme } from '@/lib/theme'
import { users } from '@/server/db/schema'
import type { Role, Tx } from '@/server/db/with-workspace'

export type Self = { id: string; name: string; email: string; role: Role; locale: Locale; theme: Theme; hasTotp: boolean }

/** The signed-in user's own row; row-level security scopes the query to the workspace. */
export async function getSelf(tx: Tx, userId: string): Promise<Self | null> {
  const [row] = await tx.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    locale: users.locale,
    theme: users.theme,
    totpSecretEnc: users.totpSecretEnc,
  }).from(users).where(eq(users.id, userId))
  if (!row) return null
  const { totpSecretEnc, ...self } = row
  return { ...self, hasTotp: totpSecretEnc !== null }
}

export async function updateSelfPreferences(tx: Tx, userId: string, preferences: { locale?: Locale; theme?: Theme }): Promise<void> {
  if (!preferences.locale && !preferences.theme) return
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

export type MemberFactor = { id: string; totpSecretEnc: string | null; totpLastStep: number | null; deactivatedAt: Date | null }

/** What a switch needs to know about its target; null when the user is not in this workspace. */
export async function getMemberFactor(tx: Tx, userId: string): Promise<MemberFactor | null> {
  const [row] = await tx.select({ id: users.id, totpSecretEnc: users.totpSecretEnc, totpLastStep: users.totpLastStep, deactivatedAt: users.deactivatedAt })
    .from(users).where(eq(users.id, userId))
  return row ?? null
}
