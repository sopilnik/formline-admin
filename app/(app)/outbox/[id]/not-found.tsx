import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import NotFound from '../../../not-found'

/**
 * "Letter not found" for the roles that read the outbox. The others get the general page, as at /outbox: this view's
 * link leads to a list they may not open.
 */
export default async function LetterNotFound() {
  const session = await getSession()
  if (!session || !can(session.role, 'outbox.read', session.workspaceKind)) return <NotFound />
  const t = await getTranslations('outbox.detail')
  return (
    <div className="flex max-w-md flex-col items-start gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{t('notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('notFoundBody')}</p>
      <Link href="/outbox" className="text-[13px] font-medium text-primary hover:underline">{t('all')}</Link>
    </div>
  )
}
