import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { cache } from 'react'
import { BackLink, CARD, CARD_TITLE } from '@/components/app/detail-page'
import { ROW_LINK } from '@/components/app/row-link'
import { CollectionForm } from '@/components/collections/collection-form'
import { DeleteCollection } from '@/components/collections/delete-collection'
import { ProductStatusBadge } from '@/components/products/product-status-badge'
import { ProductThumb } from '@/components/products/product-thumb'
import { imageSrc } from '@/lib/catalog'
import { productHref } from '@/lib/products/view'
import { SLUG_PATTERN } from '@/lib/slug'
import { cn } from '@/lib/utils'
import { requireSession } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { getCollection } from '@/server/dal/collections'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

type Params = { params: Promise<{ slug: string }> }

// The title and the page read the same collection: one set of queries per request.
const load = cache(async (slug: string) => {
  const session = await requireSession()

  return withWorkspace(workspaceContext(session), tx => getCollection(tx, session.workspaceId, slug))
})

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await getTranslations('collections')
  const slug = (await params).slug
  const collection = SLUG_PATTERN.test(slug) ? await load(slug) : null

  return { title: collection ? collection.name : t('notFoundTitle') }
}

export default async function CollectionPage({ params }: Params) {
  const session = await requireSession()

  authorize(session, 'data.read')

  const slug = (await params).slug

  if (!SLUG_PATTERN.test(slug)) {
    notFound()
  }

  const collection = await load(slug)

  if (!collection) {
    notFound()
  }

  const t = await getTranslations('collections')
  const canWrite = can(session.role, 'catalog.write', session.workspaceKind)

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/collections">{t('back')}</BackLink>
      <div>
        <h1 className="text-3xl font-bold tracking-tight break-words">{collection.name}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t('products', { count: collection.products.length })}</p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="collection-products-title" className={CARD}>
          <h2 id="collection-products-title" className={CARD_TITLE}>{t('detail.products')}</h2>
          {collection.products.length > 0 ? (
            <ul className="flex flex-col">
              {collection.products.map(product => (
                <li key={product.id} className="group/row relative flex items-center gap-3 border-b py-2 last:border-b-0">
                  <ProductThumb src={product.image ? imageSrc(product.image) : null} />
                  <Link
                    href={productHref(product.slug)}
                    prefetch={false}
                    className={cn(ROW_LINK, 'min-w-0 flex-1 truncate text-[13px] font-medium')}
                  >
                    {product.name}
                  </Link>
                  <ProductStatusBadge status={product.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t('detail.noProducts')}</p>
          )}
        </section>
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="collection-details-title" className={CARD}>
            <h2 id="collection-details-title" className={CARD_TITLE}>{t('detail.details')}</h2>
            {canWrite ? (
              <CollectionForm collection={{ id: collection.id, slug: collection.slug, name: collection.name, description: collection.description }} />
            ) : (
              <dl className="flex flex-col gap-3 text-sm">
                <div><dt className="text-muted-foreground">{t('form.slug')}</dt><dd className="break-all">{collection.slug}</dd></div>
                <div><dt className="text-muted-foreground">{t('form.description')}</dt><dd className="whitespace-pre-line">{collection.description || t('detail.none')}</dd></div>
              </dl>
            )}
          </section>
          {can(session.role, 'catalog.delete', session.workspaceKind) ? (
            <section aria-labelledby="collection-delete-title" className={CARD}>
              <h2 id="collection-delete-title" className={CARD_TITLE}>{t('delete.title')}</h2>
              <DeleteCollection id={collection.id} name={collection.name} products={collection.products.length} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
