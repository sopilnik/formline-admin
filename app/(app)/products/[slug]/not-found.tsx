import { getTranslations } from 'next-intl/server'
import { DetailNotFound } from '@/components/app/detail-page'

export default async function ProductNotFound() {
  const t = await getTranslations('products.detail')

  return <DetailNotFound title={t('notFoundTitle')} body={t('notFoundBody')} href="/products" link={t('allProducts')} />
}
