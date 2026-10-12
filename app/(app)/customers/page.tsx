import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { ExportButton } from '@/components/app/export-button'
import { Pager } from '@/components/app/pager'
import { CustomersSearch } from '@/components/customers/customers-search'
import { CustomersTable } from '@/components/customers/customers-table'
import { customersExportHref, customersHref, DEFAULT_CUSTOMERS_QUERY, isCustomersFiltered, parseCustomersQuery } from '@/lib/customers/query'
import { toCustomerRowView } from '@/lib/customers/view'
import type { SearchParams } from '@/lib/search-params'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { listCustomers } from '@/server/dal/customers'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace } from '@/server/db/with-workspace'
import { EXPORT_CAP } from '@/server/orders/export'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('customers')
  return { title: t('title') }
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession()
  authorize(session, 'data.read')
  const query = parseCustomersQuery(await searchParams)
  const { timeZone, list } = await withWorkspace(workspaceContext(session), async tx => ({
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
    list: await listCustomers(tx, session.workspaceId, query),
  }))
  // A page number past the end (an old link, a narrower search) lands on the last page, as on the other lists.
  if (list.filtered > 0 && query.page > list.pages) redirect(customersHref(query, { page: list.pages }))
  const locale = await getLocale()
  const t = await getTranslations('customers')
  const filtered = isCustomersFiltered(query)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 grow basis-64">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
            {filtered ? t('countFiltered', { filtered: list.filtered, total: list.total }) : t('count', { total: list.total })}
          </p>
        </div>
        {list.filtered > 0 && can(session.role, 'csv.export', session.workspaceKind) ? (
          <ExportButton
            namespace="customers.export"
            href={customersExportHref(query)}
            label={list.filtered > EXPORT_CAP ? t('export.first', { count: EXPORT_CAP }) : t('export.all', { count: list.filtered })}
          />
        ) : null}
      </div>
      <CustomersSearch query={query} />
      <section aria-label={t('title')} className="@container rounded-lg border bg-card p-2 pb-3">
        {list.rows.length > 0 ? (
          <>
            <CustomersTable rows={list.rows.map(row => toCustomerRowView(row, locale, timeZone))} query={query} />
            <Pager
              namespace="customers.pager"
              sizeId="customers-page-size"
              page={query.page}
              pages={list.pages}
              size={query.size}
              filtered={list.filtered}
              href={changes => customersHref(query, changes)}
            />
          </>
        ) : (
          <div className="flex flex-col items-start gap-1.5 px-3 py-8">
            <h2 className="font-sans text-base font-semibold">{list.total === 0 ? t('empty.noneTitle') : t('empty.filteredTitle')}</h2>
            <p className="text-[13px] text-muted-foreground">{list.total === 0 ? t('empty.noneBody') : t('empty.filteredBody')}</p>
            {list.total > 0 ? (
              <Link href={customersHref(DEFAULT_CUSTOMERS_QUERY, { sort: query.sort, dir: query.dir, size: query.size })} className="mt-2 text-[13px] font-medium text-primary hover:underline">
                {t('search.clear')}
              </Link>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
