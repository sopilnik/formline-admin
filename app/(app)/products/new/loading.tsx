import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

// Without it the products list's own skeleton would stand in for this form.
export default async function NewProductLoading() {
  const t = await getTranslations('products.new')

  return (
    <div role="status" className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-48" />
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    </div>
  )
}
