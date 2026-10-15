import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { QrCode } from '@/components/auth/qr-code'
import { ReauthForm } from '@/components/auth/reauth-form'
import { AuthenticatorSection } from '@/components/settings/authenticator-section'
import { PasskeysSection } from '@/components/settings/passkeys-section'
import { PasswordSection } from '@/components/settings/password-section'
import { RecoveryCodesSection } from '@/components/settings/recovery-codes-section'
import { SessionsSection } from '@/components/settings/sessions-section'
import { formatDate, formatDateTime } from '@/lib/intl'
import { isRecentAuth } from '@/server/auth/reauth'
import { countUnusedRecoveryCodes } from '@/server/auth/self-factors'
import { requireSession } from '@/server/auth/sessions'
import { formatTotpSecret, generateTotpSecret, totpUri } from '@/server/auth/totp'
import { authorize } from '@/server/authz/authorize'
import { listPasskeys } from '@/server/dal/passkeys'
import { listOwnSessions } from '@/server/dal/sessions'
import { getStoreSettings } from '@/server/dal/settings'
import { getSelf } from '@/server/dal/users'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.security')

  return { title: t('title') }
}

/**
 * Settings → Security. In the owner workspace the sensitive changes wait for a fresh sign-in, asked for once
 * at the top of the page; sandboxes skip it, their demo members have no password.
 */
export default async function SecurityPage() {
  const session = await requireSession()

  authorize(session, 'self.manage')

  const locale = await getLocale()
  const owner = session.workspaceKind === 'owner'
  const recent = isRecentAuth(session)
  const { self, passkeys, codes, sessions, timeZone } = await withWorkspace(workspaceContext(session), async tx => ({
    self: await getSelf(tx, session),
    passkeys: owner ? await listPasskeys(tx, session) : [],
    codes: await countUnusedRecoveryCodes(tx, session),
    sessions: await listOwnSessions(tx, session.userId),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))

  if (!self) {
    redirect('/sign-in')
  }

  const t = await getTranslations('settings.security')
  const auth = await getTranslations('auth')
  // A new key for every view: it only counts once its first code comes back with the form.
  const secret = generateTotpSecret()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      {owner && !recent ? <ReauthForm /> : null}
      <PasswordSection available={owner} recent={recent} />
      <AuthenticatorSection
        enabled={self.hasTotp}
        recent={recent}
        canDisable={!owner || passkeys.length > 0}
        secret={formatTotpSecret(secret)}
        qr={<QrCode value={totpUri(secret, self.email)} label={auth('totp.qr')} />}
      />
      <RecoveryCodesSection remaining={codes} hasFactor={self.hasTotp || passkeys.length > 0} recent={recent} />
      <PasskeysSection
        available={owner}
        recent={recent}
        passkeys={passkeys.map(p => ({
          id: p.id,
          name: p.name,
          added: formatDate(p.createdAt, locale, timeZone),
          lastUsed: p.lastUsedAt ? formatDate(p.lastUsedAt, locale, timeZone) : null,
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
