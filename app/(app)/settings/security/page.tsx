import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { ReauthForm } from '@/components/auth/reauth-form'
import { PasskeysSection } from '@/components/settings/passkeys-section'
import { PasswordSection } from '@/components/settings/password-section'
import { SessionsSection } from '@/components/settings/sessions-section'
import { formatDate, formatDateTime } from '@/lib/intl'
import { isRecentAuth } from '@/server/auth/reauth'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { listPasskeys } from '@/server/dal/passkeys'
import { listOwnSessions } from '@/server/dal/sessions'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.security')
  return { title: t('title') }
}

/**
 * Settings → Security (spec §8.8). In the owner workspace the sensitive changes wait for a fresh sign-in, asked for once
 * at the top of the page (spec §5.1); sandboxes skip it, their demo members have no password.
 */
export default async function SecurityPage() {
  const session = await requireSession()
  authorize({ role: session.role, workspaceKind: session.workspaceKind }, 'self.manage')
  const locale = await getLocale()
  const owner = session.workspaceKind === 'owner'
  const recent = isRecentAuth(session)
  const { passkeys, sessions, timeZone } = await withWorkspace(workspaceContext(session), async tx => ({
    passkeys: owner ? await listPasskeys(tx, session.userId) : [],
    sessions: await listOwnSessions(tx, session.userId),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
  const t = await getTranslations('settings.security')
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      {owner && !recent ? <ReauthForm /> : null}
      <PasswordSection available={owner} recent={recent} />
      <PasskeysSection
        available={owner}
        recent={recent}
        passkeys={passkeys.map(p => ({
          id: p.id,
          name: p.name,
          added: formatDate(p.createdAt, locale),
          lastUsed: p.lastUsedAt ? formatDate(p.lastUsedAt, locale) : null,
        }))}
      />
      <SessionsSection
        sessions={sessions.map(s => ({
          id: s.id,
          device: s.userAgentSummary,
          signedIn: formatDateTime(s.createdAt, locale, timeZone),
          lastActive: formatDateTime(s.lastSeenAt, locale, timeZone),
          current: s.id === session.id,
        }))}
      />
    </div>
  )
}
