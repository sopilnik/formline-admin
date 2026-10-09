import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

export default async function NotificationsLoading() {
  const t = await getTranslations('notifications')
  return (
    <div role="status" className="mx-auto flex max-w-3xl flex-col gap-5">
      <span className="sr-only">{t('loading')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    </div>
  )
}
