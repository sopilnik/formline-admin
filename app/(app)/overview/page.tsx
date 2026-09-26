import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireSession } from '@/server/auth/sessions'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('overview')
  return { title: t('title') }
}

// Every page checks the session itself: a layout does not re-run on client navigation.
export default async function OverviewPage() {
  await requireSession()
  const t = await getTranslations('overview')
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('placeholder')}</p>
    </div>
  )
}
