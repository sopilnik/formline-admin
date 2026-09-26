import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { QrCode } from '@/components/auth/qr-code'
import { SetupForm } from '@/components/auth/setup-form'
import { findOwner } from '@/server/auth/owner'
import { getSession } from '@/server/auth/sessions'
import { formatTotpSecret, generateTotpSecret, totpUri } from '@/server/auth/totp'
import { authConfig } from '@/server/config'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.setup')
  return { title: t('title') }
}

export default async function SetupPage() {
  if (!authConfig().setupToken) notFound()
  const owner = await findOwner()
  // Once the owner exists the page is gone — except for the owner who has just
  // finished it: setting the session cookie re-renders this page, and the form
  // keeps showing the recovery codes it received.
  if (owner && (await getSession())?.userId !== owner.id) notFound()
  const t = await getTranslations('auth')
  const secret = generateTotpSecret()
  return (
    <AuthCard title={t('setup.title')} description={t('setup.intro')}>
      <SetupForm
        completed={owner !== null}
        secret={formatTotpSecret(secret)}
        qr={<QrCode value={totpUri(secret, 'owner')} label={t('totp.qr')} />}
      />
    </AuthCard>
  )
}
