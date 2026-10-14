import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { DemoEntry } from '@/components/auth/demo-entry'
import { PasskeySignIn } from '@/components/auth/passkey-sign-in'
import { SignInForm } from '@/components/auth/sign-in-form'
import { getSession } from '@/server/auth/sessions'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.signIn')
  return { title: t('title') }
}

// Without a session cookie this page does not touch the database.
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if ((await getSession())?.secondFactorVerified) redirect('/overview')
  const params = await searchParams
  const ended = params.ended === '1'
  const t = await getTranslations('auth.signIn')
  return (
    <AuthCard title={t('title')} description={t('intro')}>
      <div className="flex flex-col gap-5">
        <DemoEntry ended={ended} />
        <h2 className="text-base font-bold">{t('ownerSignIn')}</h2>
        <PasskeySignIn />
        <div aria-hidden className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          {t('or')}
          <span className="h-px flex-1 bg-border" />
        </div>
        <SignInForm expired={params.expired === '1'} />
      </div>
    </AuthCard>
  )
}
