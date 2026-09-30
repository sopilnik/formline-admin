import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

export default async function CustomersLoading() {
  const t = await getTranslations('customers')
  return (
    <div role="status" className="flex flex-col gap-5">
      <span className="sr-only">{t('loading')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-8 w-full md:w-[300px]" />
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    </div>
  )
}
