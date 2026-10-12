import { getTranslations } from 'next-intl/server'
import { DetailNotFound } from '@/components/app/detail-page'

export default async function CollectionNotFound() {
  const t = await getTranslations('collections')
  return <DetailNotFound title={t('notFoundTitle')} body={t('notFoundBody')} href="/collections" link={t('all')} />
}
