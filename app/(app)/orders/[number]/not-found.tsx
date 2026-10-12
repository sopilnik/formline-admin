import { getTranslations } from 'next-intl/server'
import { DetailNotFound } from '@/components/app/detail-page'

export default async function OrderNotFound() {
  const t = await getTranslations('orders.detail')
  return <DetailNotFound title={t('notFoundTitle')} body={t('notFoundBody')} href="/orders" link={t('allOrders')} />
}
