import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

export default async function OrderLoading() {
  const t = await getTranslations('orders.detail')

  return (
    <div role="status" className="flex flex-col gap-5">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      </div>
    </div>
  )
}
