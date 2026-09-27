import 'server-only'
import { eq } from 'drizzle-orm'
import { TIME_ZONE } from '@/i18n/locale'
import { validTimeZone } from '@/lib/periods'
import { storeSettings } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type StoreSettings = { storeName: string; supportEmail: string; timezone: string; lowStockDefault: number }

export const DEFAULT_SETTINGS: StoreSettings = { storeName: 'Formline', supportEmail: 'support@formline.example', timezone: TIME_ZONE, lowStockDefault: 3 }

/** The workspace's settings row; the defaults when it has none (spec §6.1). The zone is checked against Intl. */
export async function getStoreSettings(tx: Tx, workspaceId: string): Promise<StoreSettings> {
  const [row] = await tx.select().from(storeSettings).where(eq(storeSettings.workspaceId, workspaceId))
  if (!row) return DEFAULT_SETTINGS
  return { storeName: row.storeName, supportEmail: row.supportEmail, timezone: validTimeZone(row.timezone), lowStockDefault: row.lowStockDefault }
}
