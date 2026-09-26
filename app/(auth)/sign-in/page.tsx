import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { SignInForm } from '@/components/auth/sign-in-form'
import { getSession } from '@/server/auth/sessions'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn')
  return { title: t('title') }
}

// Without a session cookie this page does not touch the database (spec §6.5).
export default async function SignInPage() {
  if ((await getSession())?.secondFactorVerified) redirect('/overview')
  const t = await getTranslations('auth.signIn')
  return (
    <AuthCard title={t('title')} description={t('intro')}>
      <SignInForm />
    </AuthCard>
  )
}
