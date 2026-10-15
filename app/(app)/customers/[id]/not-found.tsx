import { getTranslations } from 'next-intl/server'
import { DetailNotFound } from '@/components/app/detail-page'

export default async function CustomerNotFound() {
  const t = await getTranslations('customers.detail')

  return <DetailNotFound title={t('notFoundTitle')} body={t('notFoundBody')} href="/customers" link={t('allCustomers')} />
}
