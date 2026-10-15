import { getTranslations } from 'next-intl/server'
import { DetailNotFound } from '@/components/app/detail-page'
import { PageNotFound } from '@/components/app/page-not-found'
import { getSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'

/**
 * "Letter not found" for the roles that read the outbox. The others get the general message, as at /outbox: this view's
 * link leads to a list they may not open.
 */
export default async function LetterNotFound() {
  const session = await getSession()

  if (!session || !can(session.role, 'outbox.read', session.workspaceKind)) return <PageNotFound />

  const t = await getTranslations('outbox.detail')

  return <DetailNotFound title={t('notFoundTitle')} body={t('notFoundBody')} href="/outbox" link={t('all')} />
}
