import 'server-only'
import { eq } from 'drizzle-orm'
import { TIME_ZONE } from '@/i18n/locale'
import { validTimeZone } from '@/lib/periods'
import { currentZoneName } from '@/lib/settings/fields'
import { storeSettings } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type StoreSettings = { storeName: string; supportEmail: string; timezone: string; lowStockDefault: number }

export const DEFAULT_SETTINGS: StoreSettings = { storeName: 'Formline', supportEmail: 'support@formline.example', timezone: TIME_ZONE, lowStockDefault: 3 }

/** The workspace's settings row; the defaults when it has none. The zone is checked against Intl and given under today's name, so the form's list has it. */
export async function getStoreSettings(tx: Tx, workspaceId: string): Promise<StoreSettings> {
  const [row] = await tx.select().from(storeSettings).where(eq(storeSettings.workspaceId, workspaceId))
  if (!row) return DEFAULT_SETTINGS
  return { storeName: row.storeName, supportEmail: row.supportEmail, timezone: validTimeZone(currentZoneName(row.timezone)), lowStockDefault: row.lowStockDefault }
}

/**
 * The store form's save: owners and admins, as row-level security allows. Only what changed is
 * written; the fields it changed come back, or null when the workspace has no settings row to change.
 */
export async function updateStoreSettings(tx: Tx, workspaceId: string, input: StoreSettings): Promise<(keyof StoreSettings)[] | null> {
  const [current] = await tx.select().from(storeSettings).where(eq(storeSettings.workspaceId, workspaceId))
  if (!current) return null
  const changed = (['storeName', 'supportEmail', 'timezone', 'lowStockDefault'] as const).filter(field => current[field] !== input[field])
  if (changed.length === 0) return changed
  const updated = await tx.update(storeSettings).set(input).where(eq(storeSettings.workspaceId, workspaceId)).returning({ id: storeSettings.workspaceId })
  return updated.length === 1 ? changed : null
}
