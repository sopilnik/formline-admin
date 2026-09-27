import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

export default async function OrdersLoading() {
  const t = await getTranslations('orders')
  return (
    <div role="status" className="flex flex-col gap-5">
      <span className="sr-only">{t('loading')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}
      </div>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-7 w-full" />)}
      </div>
    </div>
  )
}
