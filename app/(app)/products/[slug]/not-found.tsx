import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function ProductNotFound() {
  const t = await getTranslations('products.detail')
  return (
    <div className="flex max-w-md flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{t('notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('notFoundBody')}</p>
      <Link href="/products" className="text-[13px] font-medium text-primary hover:underline">{t('allProducts')}</Link>
    </div>
  )
}
