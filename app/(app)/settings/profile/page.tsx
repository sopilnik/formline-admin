import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ProfileForm } from '@/components/settings/profile-form'
import { requireSession } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { getSelf } from '@/server/dal/users'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.profile')
  return { title: t('title') }
}

export default async function ProfilePage() {
  const session = await requireSession()
  authorize(session, 'self.manage')
  const self = await withWorkspace(workspaceContext(session), tx => getSelf(tx, session))
  if (!self) redirect('/sign-in')
  const t = await getTranslations('settings.profile')
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <section aria-labelledby="profile-account" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <div>
          <h2 id="profile-account" className="font-sans text-[15px] font-semibold">{t('account')}</h2>
          <p className="mt-1 text-[13px] wrap-anywhere text-muted-foreground">{t('email', { email: self.email })}</p>
        </div>
        <ProfileForm profile={{ name: self.name, locale: self.locale, theme: self.theme, shortcuts: self.shortcutsEnabled ? 'on' : '' }} />
      </section>
    </div>
  )
}
