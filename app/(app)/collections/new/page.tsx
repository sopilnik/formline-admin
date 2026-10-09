import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { CollectionForm } from '@/components/collections/collection-form'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('collections')
  return { title: t('new') }
}

/** The new-collection form (spec §8.3); a role that cannot write the catalog gets the not-found page. */
export default async function NewCollectionPage() {
  const session = await requireSession()
  if (!can(session.role, 'catalog.write', session.workspaceKind)) notFound()
  const t = await getTranslations('collections')
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <Link href="/collections" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] font-medium text-ink-2 hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">{t('new')}</h1>
      <section aria-label={t('new')} className="rounded-lg border bg-card p-5">
        <CollectionForm />
      </section>
    </div>
  )
}
