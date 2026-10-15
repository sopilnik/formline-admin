import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { cache } from 'react'
import { AuthCard } from '@/components/auth/auth-card'
import { QrCode } from '@/components/auth/qr-code'
import { SetupForm } from '@/components/auth/setup-form'
import { findOwner } from '@/server/auth/owner'
import { getSession } from '@/server/auth/sessions'
import { formatTotpSecret, generateTotpSecret, totpUri } from '@/server/auth/totp'
import { authConfig } from '@/server/config'

/**
 * The owner, and whether the page is gone: without a setup token, and once the owner exists — except for the owner who
 * has just finished it: setting the session cookie re-renders this page, and the form keeps showing the recovery codes
 * it received. The title and the page ask once per request.
 */
const setupState = cache(async () => {
  if (!authConfig().setupToken) {
    return { owner: null, gone: true }
  }

  const owner = await findOwner()

  return { owner, gone: owner !== null && (await getSession())?.userId !== owner.id }
})

export async function generateMetadata(): Promise<Metadata> {
  if ((await setupState()).gone) {
    return { title: (await getTranslations('notFound'))('title') }
  }

  const t = await getTranslations('auth.setup')

  return { title: t('title') }
}

export default async function SetupPage() {
  const { owner, gone } = await setupState()

  if (gone) {
    notFound()
  }

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
