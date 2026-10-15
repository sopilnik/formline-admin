import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { SettingsTabs } from '@/components/settings/settings-tabs'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'

/** Settings: the profile and security for everyone, the store for owners and admins. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const t = await getTranslations('settings')
  const tabs = [
    { href: '/settings/profile', label: t('tabs.profile') },
    { href: '/settings/security', label: t('tabs.security') },
    ...(can(session.role, 'settings.store', session.workspaceKind) ? [{ href: '/settings/store', label: t('tabs.store') }] : []),
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <SettingsTabs label={t('tabs.label')} tabs={tabs} />
      {children}
    </div>
  )
}
