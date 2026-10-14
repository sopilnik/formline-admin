import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

export default async function TeamLoading() {
  const t = await getTranslations('team')
  return (
    <div role="status" className="flex flex-col gap-5">
      <span className="sr-only">{t('loading')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    </div>
  )
}
