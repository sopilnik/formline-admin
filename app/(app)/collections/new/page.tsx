import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/app/detail-page'
import { CollectionForm } from '@/components/collections/collection-form'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { titleFor } from '@/server/authz/page-title'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('collections')

  return { title: await titleFor('catalog.write', t('new')) }
}

/** The new-collection form; a role that cannot write the catalog gets the not-found page. */
export default async function NewCollectionPage() {
  const session = await requireSession()

  if (!can(session.role, 'catalog.write', session.workspaceKind)) {
    notFound()
  }

  const t = await getTranslations('collections')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <BackLink href="/collections">{t('back')}</BackLink>
      <h1 className="text-3xl font-bold tracking-tight">{t('new')}</h1>
      <section aria-label={t('new')} className="rounded-lg border bg-card p-5">
        <CollectionForm />
      </section>
    </div>
  )
}
