import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ReauthForm } from '@/components/auth/reauth-form'
import { StoreSettingsForm } from '@/components/settings/store-settings-form'
import { StripeImportSection } from '@/components/settings/stripe-import-section'
import { timeZones } from '@/lib/settings/fields'
import { isRecentAuth } from '@/server/auth/reauth'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { titleFor } from '@/server/authz/page-title'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.store')
  return { title: await titleFor('settings.store', t('title')) }
}

/**
 * Settings → Store (spec §8.8): owners and admins; for other roles the address does not exist. The owner of the owner
 * workspace also imports the store orders the webhook missed, after a fresh sign-in (spec §7.5).
 */
export default async function StoreSettingsPage() {
  const session = await requireSession()
  if (!can(session.role, 'settings.store', session.workspaceKind)) notFound()
  const settings = await withWorkspace(workspaceContext(session), tx => getStoreSettings(tx, session.workspaceId))
  const t = await getTranslations('settings.store')
  const importing = can(session.role, 'stripe.import', session.workspaceKind)
  const recent = isRecentAuth(session)
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <section aria-labelledby="store-details" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <div>
          <h2 id="store-details" className="font-sans text-[15px] font-semibold">{t('details')}</h2>
          <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">{t('intro')}</p>
        </div>
        <StoreSettingsForm
          settings={{ storeName: settings.storeName, supportEmail: settings.supportEmail, timezone: settings.timezone, lowStockDefault: String(settings.lowStockDefault) }}
          zones={timeZones()}
        />
      </section>
      {importing && !recent ? <ReauthForm intro={t('stripe.reauthIntro')} /> : null}
      {importing ? <StripeImportSection recent={recent} /> : null}
    </div>
  )
}
