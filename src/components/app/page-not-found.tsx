import { getTranslations } from 'next-intl/server'
import { DetailNotFound } from '@/components/app/detail-page'

/** The general "page not found" inside the frame: a page this role may not open, or an address the panel does not know. */
export async function PageNotFound() {
  const t = await getTranslations('notFound')
  const nav = await getTranslations('nav')
  return <DetailNotFound title={t('title')} body={t('description')} href="/overview" link={nav('overview')} />
}
