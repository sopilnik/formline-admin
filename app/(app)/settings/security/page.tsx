import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { ReauthForm } from '@/components/auth/reauth-form'
import { PasskeysSection } from '@/components/settings/passkeys-section'
import { formatDate } from '@/lib/intl'
import { isRecentAuth } from '@/server/auth/reauth'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { listPasskeys } from '@/server/dal/passkeys'
import { withWorkspace } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.security')
  return { title: t('title') }
}

export default async function SecurityPage() {
  const session = await requireSession()
  authorize({ role: session.role, workspaceKind: session.workspaceKind }, 'self.manage')
  const locale = await getLocale()
  const owner = session.workspaceKind === 'owner'
  const passkeys = owner ? await withWorkspace(workspaceContext(session), tx => listPasskeys(tx, session.userId)) : []
  const t = await getTranslations('settings.security')
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <PasskeysSection
        available={owner}
        recent={isRecentAuth(session)}
        passkeys={passkeys.map(p => ({
          id: p.id,
          name: p.name,
          added: formatDate(p.createdAt, locale),
          lastUsed: p.lastUsedAt ? formatDate(p.lastUsedAt, locale) : null,
        }))}
        reauth={<ReauthForm />}
      />
    </div>
  )
}
