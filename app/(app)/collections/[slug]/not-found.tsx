import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function CollectionNotFound() {
  const t = await getTranslations('collections')
  return (
    <div className="flex max-w-md flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{t('notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('notFoundBody')}</p>
      <Link href="/collections" className="text-[13px] font-medium text-primary hover:underline">{t('all')}</Link>
    </div>
  )
}
