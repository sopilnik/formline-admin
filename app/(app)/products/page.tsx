import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { ListBody, ListRefresh, ListStatus } from '@/components/app/list-status'
import { Pager } from '@/components/app/pager'
import { ProductsFilters } from '@/components/products/products-filters'
import { ProductsTable } from '@/components/products/products-table'
import { buttonVariants } from '@/components/ui/button'
import { DEFAULT_PRODUCTS_QUERY, isProductsFiltered, parseProductsQuery, productsHref } from '@/lib/products/query'
import { toProductRowView } from '@/lib/products/view'
import { pageRange } from '@/lib/pagination'
import type { SearchParams } from '@/lib/search-params'
import { requireSession } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { listProducts } from '@/server/dal/products'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('products')
  return { title: t('title') }
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession()
  authorize(session, 'data.read')
  const query = parseProductsQuery(await searchParams)
  const { timeZone, list } = await withWorkspace(workspaceContext(session), async tx => ({
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
    list: await listProducts(tx, session.workspaceId, query),
  }))
  // A page number past the end (an old link, a narrower filter) lands on the last page, as on the orders.
  if (list.filtered > 0 && query.page > list.pages) redirect(productsHref(query, { page: list.pages }))
  const locale = await getLocale()
  const t = await getTranslations('products')
  const filtered = isProductsFiltered(query)
  const count = filtered ? t('countFiltered', { filtered: list.filtered, total: list.total }) : t('count', { total: list.total })
  const empty = list.total === 0 ? t('empty.noneTitle') : t('empty.filteredTitle')
  const results = list.rows.length > 0 ? t('pager.range', { ...pageRange(query.page, query.size, list.filtered), total: list.filtered }) : empty
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 grow basis-64">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">{count}</p>
        </div>
        {can(session.role, 'catalog.write', session.workspaceKind) ? (
          <Link href="/products/new" className={buttonVariants()}>
            <Plus aria-hidden />
            {t('new.title')}
          </Link>
        ) : null}
      </div>
      <ListStatus text={`${count}. ${results}`} />
      <ListRefresh>
        <ProductsFilters query={query} statusCounts={list.statusCounts} collections={list.collections} />
        <ListBody className="@container rounded-lg border bg-card p-2 pb-3">
          {list.rows.length > 0 ? (
            <>
              <ProductsTable rows={list.rows.map(row => toProductRowView(row, locale, timeZone))} query={query} />
              <Pager
                namespace="products.pager"
                sizeId="products-page-size"
                page={query.page}
                pages={list.pages}
                size={query.size}
                filtered={list.filtered}
                href={changes => productsHref(query, changes)}
              />
            </>
          ) : (
            <div className="flex flex-col items-start gap-1.5 px-3 py-8">
              <h2 className="font-sans text-base font-semibold">{empty}</h2>
              <p className="text-[13px] text-muted-foreground">{list.total === 0 ? t('empty.noneBody') : t('empty.filteredBody')}</p>
              {list.total > 0 ? (
                <Link href={productsHref(DEFAULT_PRODUCTS_QUERY, { sort: query.sort, dir: query.dir, size: query.size })} className="mt-2 text-[13px] font-medium text-primary hover:underline">
                  {t('filters.clear')}
                </Link>
              ) : null}
            </div>
          )}
        </ListBody>
      </ListRefresh>
    </div>
  )
}
