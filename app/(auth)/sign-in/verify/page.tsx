import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { VerifyForm } from '@/components/auth/verify-form'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { getSelf } from '@/server/dal/users'
import { withWorkspace } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.verify')
  return { title: t('title') }
}

export default async function VerifyPage() {
  const session = await requireSession({ pending: true })
  if (session.secondFactorVerified) redirect('/overview')
  const self = await withWorkspace(workspaceContext(session), tx => getSelf(tx, session.userId))
  const t = await getTranslations('auth.verify')
  return (
    <AuthCard title={t('title')}>
      <VerifyForm hasTotp={self?.hasTotp ?? false} />
    </AuthCard>
  )
}
