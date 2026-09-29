import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

export default async function ProductLoading() {
  const t = await getTranslations('products.detail')
  return (
    <div role="status" className="flex flex-col gap-5">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
        <Skeleton className="aspect-[5/7] w-full max-w-60 rounded-lg" />
      </div>
    </div>
  )
}
