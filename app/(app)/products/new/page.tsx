import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { BackLink } from '@/components/app/detail-page'
import { NewProductForm } from '@/components/products/new-product-form'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { titleFor } from '@/server/authz/page-title'
import { listCollectionOptions } from '@/server/dal/products'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('products.new')
  return { title: await titleFor('catalog.write', t('title')) }
}

/** The new-product form; a role that cannot write products gets the not-found page. */
export default async function NewProductPage() {
  const session = await requireSession()
  if (!can(session.role, 'catalog.write', session.workspaceKind)) notFound()
  const collections = await withWorkspace(workspaceContext(session), tx => listCollectionOptions(tx, session.workspaceId))
  const t = await getTranslations('products')
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <BackLink href="/products">{t('detail.back')}</BackLink>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('new.title')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t('new.intro')}</p>
      </div>
      <section aria-label={t('new.title')} className="rounded-lg border bg-card p-5">
        <NewProductForm collections={collections.map(c => ({ id: c.id, name: c.name }))} />
      </section>
    </div>
  )
}
