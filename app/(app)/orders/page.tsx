import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Pager } from '@/components/app/pager'
import { ExportButton } from '@/components/orders/export-button'
import { OrdersFilters } from '@/components/orders/orders-filters'
import { OrdersTable } from '@/components/orders/orders-table'
import { DEFAULT_QUERY, exportHref, isFiltered, ordersHref, parseOrdersQuery, type SearchParams } from '@/lib/orders/query'
import { toRowView } from '@/lib/orders/view'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { listOrders } from '@/server/dal/orders'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace } from '@/server/db/with-workspace'
import { EXPORT_CAP } from '@/server/orders/export'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('orders')
  return { title: t('title') }
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession()
  authorize(session, 'data.read')
  const query = parseOrdersQuery(await searchParams)
  const now = new Date()
  const { timeZone, page } = await withWorkspace(workspaceContext(session), async tx => {
    const settings = await getStoreSettings(tx, session.workspaceId)
    return { timeZone: settings.timezone, page: await listOrders(tx, session.workspaceId, query, now, settings.timezone) }
  })
  // A page number past the end (an old link, a narrower filter) lands on the last page.
  if (page.filtered > 0 && query.page > page.pages) redirect(ordersHref(query, { page: page.pages }))
  const locale = await getLocale()
  const t = await getTranslations('orders')
  const filtered = isFiltered(query)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
            {filtered ? t('countFiltered', { filtered: page.filtered, total: page.total }) : t('count', { total: page.total })}
          </p>
        </div>
        {page.filtered > 0 && can(session.role, 'csv.export', session.workspaceKind) ? (
          <ExportButton
            href={exportHref(query)}
            label={page.filtered > EXPORT_CAP ? t('export.first', { count: EXPORT_CAP }) : t('export.all', { count: page.filtered })}
          />
        ) : null}
      </div>
      <OrdersFilters query={query} statusCounts={page.statusCounts} />
      <section aria-label={t('title')} className="@container rounded-lg border bg-card p-2 pb-3">
        {page.rows.length > 0 ? (
          <>
            <OrdersTable
              key={ordersHref(query)}
              rows={page.rows.map(row => toRowView(row, locale, timeZone))}
              query={query}
              canUpdate={can(session.role, 'orders.update', session.workspaceKind)}
            />
            <Pager
              namespace="orders.pager"
              sizeId="orders-page-size"
              page={query.page}
              pages={page.pages}
              size={query.size}
              filtered={page.filtered}
              href={changes => ordersHref(query, changes)}
            />
          </>
        ) : (
          <div className="flex flex-col items-start gap-1.5 px-3 py-8">
            <h2 className="font-sans text-base font-semibold">{page.total === 0 ? t('empty.noneTitle') : t('empty.filteredTitle')}</h2>
            <p className="text-[13px] text-muted-foreground">{page.total === 0 ? t('empty.noneBody') : t('empty.filteredBody')}</p>
            {page.total > 0 ? (
              <Link href={ordersHref(DEFAULT_QUERY, { sort: query.sort, dir: query.dir, size: query.size })} className="mt-2 text-[13px] font-medium text-primary hover:underline">
                {t('filters.clear')}
              </Link>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
