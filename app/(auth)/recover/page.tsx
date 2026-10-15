import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { QrCode } from '@/components/auth/qr-code'
import { RecoverForm } from '@/components/auth/recover-form'
import { formatTotpSecret, generateTotpSecret, totpUri } from '@/server/auth/totp'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.recover')

  return { title: t('title') }
}

// Setting the session cookie re-renders this page with a new key; the form keeps
// showing the recovery codes it received.
export default async function RecoverPage() {
  const t = await getTranslations('auth')
  const secret = generateTotpSecret()

  return (
    <AuthCard title={t('recover.title')} description={t('recover.intro')}>
      <RecoverForm secret={formatTotpSecret(secret)} qr={<QrCode value={totpUri(secret, 'owner')} label={t('totp.qr')} />} />
    </AuthCard>
  )
}
