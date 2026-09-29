import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { ProductDetailsForm } from '@/components/products/product-details-form'
import { ProductFacts } from '@/components/products/product-facts'
import { ProductImage } from '@/components/products/product-image'
import { ProductStatusBadge } from '@/components/products/product-status-badge'
import { VariantsTable, type VariantView } from '@/components/products/variants-table'
import { imageSrc, variantLabel } from '@/lib/catalog'
import { formatDateTime, formatMoney } from '@/lib/intl'
import { priceField } from '@/lib/products/price'
import { SLUG_PATTERN } from '@/lib/slug'
import { cn } from '@/lib/utils'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { getProduct, listCollectionOptions } from '@/server/dal/products'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace } from '@/server/db/with-workspace'

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

const CARD = 'flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-5'
const CARD_TITLE = 'font-sans text-[15px] font-semibold'

export default async function ProductPage({ params }: Params) {
  const session = await requireSession()
  authorize(session, 'data.read')
  const slug = parseSlug((await params).slug)
  if (slug === null) notFound()
  const { product, collections, timeZone } = await load(slug)
  if (!product) notFound()
  const locale = await getLocale()
  const t = await getTranslations('products')
  const canWrite = can(session.role, 'catalog.write', session.workspaceKind)
  const variants: VariantView[] = product.variants.map(v => ({
    id: v.id, label: variantLabel(v.size, v.palette), sku: v.sku, price: formatMoney(v.priceCents, locale),
    custom: v.priceOverrideCents !== null, stock: v.stock, lowStockThreshold: v.lowStockThreshold,
  }))
  return (
    <div className="flex flex-col gap-5">
      <Link href="/products" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] font-medium text-ink-2 hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        {t('detail.back')}
      </Link>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 grow basis-64">
          <h1 className="text-3xl font-bold tracking-tight break-words">{product.name}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t('detail.subtitle', { collection: product.collection.name, date: formatDateTime(product.updatedAt, locale, timeZone) })}
          </p>
        </div>
        <ProductStatusBadge status={product.status} />
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
            <VariantsTable variants={variants} />
          </section>
        </div>
        <section aria-labelledby="image-title" className={CARD}>
          <h2 id="image-title" className={CARD_TITLE}>{t('detail.image')}</h2>
          <ProductImage src={product.image ? imageSrc(product.image) : null} width={product.image?.width ?? 0} height={product.image?.height ?? 0} />
        </section>
      </div>
    </div>
  )
}
