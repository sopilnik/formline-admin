import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { BackLink, CARD, CARD_TITLE } from '@/components/app/detail-page'
import { DeleteProduct } from '@/components/products/delete-product'
import { ProductDetailsForm } from '@/components/products/product-details-form'
import { ProductFacts } from '@/components/products/product-facts'
import { ProductImage } from '@/components/products/product-image'
import { ProductImageEditor } from '@/components/products/product-image-editor'
import { ProductStatusControl } from '@/components/products/product-status-control'
import { VariantsForm } from '@/components/products/variants-form'
import { VariantsTable, type VariantView } from '@/components/products/variants-table'
import { imageSrc, variantLabel } from '@/lib/catalog'
import { formatDateTime, formatMoney } from '@/lib/intl'
import { priceField, variantPriceCents } from '@/lib/products/price'
import { deleteBlocker } from '@/lib/products/status'
import { SLUG_PATTERN } from '@/lib/slug'
import { cn } from '@/lib/utils'
import { requireSession } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { getProduct, listCollectionOptions } from '@/server/dal/products'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

type Params = { params: Promise<{ slug: string }> }

const parseSlug = (value: string): string | null => (SLUG_PATTERN.test(value) ? value : null)

// The title and the page read the same product: one set of queries per request.
const load = cache(async (slug: string) => {
  const session = await requireSession()

  return withWorkspace(workspaceContext(session), async tx => ({
    product: await getProduct(tx, session.workspaceId, slug),
    collections: await listCollectionOptions(tx, session.workspaceId),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
})

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await getTranslations('products.detail')
  const slug = parseSlug((await params).slug)
  const product = slug === null ? null : (await load(slug)).product

  return { title: product ? product.name : t('notFoundTitle') }
}

export default async function ProductPage({ params }: Params) {
  const session = await requireSession()

  authorize(session, 'data.read')

  const slug = parseSlug((await params).slug)

  if (slug === null) {
    notFound()
  }

  const { product, collections, timeZone } = await load(slug)

  if (!product) {
    notFound()
  }

  const locale = await getLocale()
  const t = await getTranslations('products')
  const canWrite = can(session.role, 'catalog.write', session.workspaceKind)
  const variants: VariantView[] = product.variants.map(v => ({
    id: v.id, label: variantLabel(v.size, v.palette), sku: v.sku, price: formatMoney(v.priceCents, locale),
    custom: v.priceOverrideCents !== null, stock: v.stock, lowStockThreshold: v.lowStockThreshold,
  }))
  const image = product.image ? { src: imageSrc(product.image), width: product.image.width, height: product.image.height } : null

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/products">{t('detail.back')}</BackLink>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 grow basis-64">
          <h1 className="text-3xl font-bold tracking-tight break-words">{product.name}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t('detail.subtitle', { collection: product.collection.name, date: formatDateTime(product.updatedAt, locale, timeZone) })}
          </p>
        </div>
        <ProductStatusControl productId={product.id} name={product.name} status={product.status} canWrite={canWrite} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="details-title" className={CARD}>
            <h2 id="details-title" className={CARD_TITLE}>{t('detail.details')}</h2>
            {canWrite ? (
              <ProductDetailsForm
                productId={product.id}
                slug={product.slug}
                version={product.version}
                collections={collections}
                values={{
                  name: product.name, slug: product.slug, collection: product.collection.id, basePrice: priceField(product.basePriceCents, locale),
                  tags: product.tags.join(', '), description: product.description,
                }}
              />
            ) : (
              <>
                <p className="text-[13px] text-muted-foreground">{t('detail.readOnly')}</p>
                <ProductFacts
                  slug={product.slug} collection={product.collection.name} basePrice={formatMoney(product.basePriceCents, locale)}
                  tags={product.tags} description={product.description}
                />
              </>
            )}
          </section>
          <section aria-labelledby="variants-title" className={cn(CARD, '@container')}>
            <h2 id="variants-title" className={CARD_TITLE}>{t('detail.variants')}</h2>
            {canWrite ? (
              <VariantsForm
                productId={product.id}
                rows={product.variants.map(v => ({
                  id: v.id, label: variantLabel(v.size, v.palette), sku: v.sku,
                  computedPrice: priceField(variantPriceCents(product.basePriceCents, v.size, null), locale),
                  override: v.priceOverrideCents === null ? '' : priceField(v.priceOverrideCents, locale),
                  stock: v.stock, threshold: v.lowStockThreshold,
                }))}
              />
            ) : (
              <VariantsTable variants={variants} />
            )}
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="image-title" className={CARD}>
            <h2 id="image-title" className={CARD_TITLE}>{t('detail.image')}</h2>
            {canWrite ? (
              <ProductImageEditor productId={product.id} name={product.name} image={image} />
            ) : (
              <ProductImage image={image} />
            )}
          </section>
          {can(session.role, 'catalog.delete', session.workspaceKind) ? (
            <section aria-labelledby="delete-title" className={CARD}>
              <h2 id="delete-title" className={CARD_TITLE}>{t('delete.title')}</h2>
              <DeleteProduct
                productId={product.id}
                name={product.name}
                variants={product.variants.length}
                hasImage={product.image !== null}
                blocked={deleteBlocker(product.status, product.hasOrders)}
              />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
