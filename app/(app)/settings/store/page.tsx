import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { StoreSettingsForm } from '@/components/settings/store-settings-form'
import { timeZones } from '@/lib/settings/fields'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.store')
  return { title: t('title') }
}

/** Settings → Store (spec §8.8): owners and admins; for other roles the address does not exist. */
export default async function StoreSettingsPage() {
  const session = await requireSession()
  if (!can(session.role, 'settings.store', session.workspaceKind)) notFound()
  const settings = await withWorkspace(workspaceContext(session), tx => getStoreSettings(tx, session.workspaceId))
  const t = await getTranslations('settings.store')
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <section aria-labelledby="store-details" className="flex max-w-2xl flex-col gap-4 rounded-lg border bg-card p-5">
        <div>
          <h2 id="store-details" className="font-sans text-[15px] font-semibold">{t('details')}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{t('intro')}</p>
        </div>
        <StoreSettingsForm
          settings={{ storeName: settings.storeName, supportEmail: settings.supportEmail, timezone: settings.timezone, lowStockDefault: String(settings.lowStockDefault) }}
          zones={timeZones()}
        />
      </section>
    </div>
  )
}
