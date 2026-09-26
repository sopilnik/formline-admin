import 'server-only'
import { eq } from 'drizzle-orm'
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
