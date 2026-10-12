import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { CollectionsList } from '@/components/collections/collections-list'
import { buttonVariants } from '@/components/ui/button'
import { requireSession } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { listCollections } from '@/server/dal/collections'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('collections')
  return { title: t('title') }
}

export default async function CollectionsPage() {
  const session = await requireSession()
  authorize(session, 'data.read')
  const rows = await withWorkspace(workspaceContext(session), tx => listCollections(tx, session.workspaceId))
  const t = await getTranslations('collections')
  const canWrite = can(session.role, 'catalog.write', session.workspaceKind)
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 grow basis-64">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t('intro')}</p>
        </div>
        {canWrite ? (
          <Link href="/collections/new" className={buttonVariants()}>
            <Plus aria-hidden />
            {t('new')}
          </Link>
        ) : null}
      </div>
      <section aria-label={t('title')} className="rounded-lg border bg-card p-2">
        {rows.length > 0 ? (
          <CollectionsList rows={rows.map(({ id, slug, name, description, products }) => ({ id, slug, name, description, products }))} canWrite={canWrite} />
        ) : (
          <p className="px-3 py-8 text-[13px] text-muted-foreground">{t('empty')}</p>
        )}
      </section>
    </div>
  )
}
