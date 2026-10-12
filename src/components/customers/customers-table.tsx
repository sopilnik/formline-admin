import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ROW_LINK } from '@/components/app/row-link'
import { SortHeader, type SortDir } from '@/components/app/sort-header'
import { customersHref, FIRST_DIR, type CustomerSort, type CustomersQuery } from '@/lib/customers/query'
import type { CustomerRowView } from '@/lib/customers/view'
import { cn } from '@/lib/utils'

const TH = 'h-10 border-b bg-card px-3 text-left font-medium whitespace-nowrap text-muted-foreground'
const TD = 'border-b px-3 py-2 group-last/row:border-b-0'

/**
 * The customers (spec §8.5) as a table while the list is at least 56 rem wide, as cards below —
 * a container query on the list, as on the orders and the products (stage 4 amendment 10).
 */
export function CustomersTable({ rows, query }: { rows: CustomerRowView[]; query: CustomersQuery }) {
  const t = useTranslations('customers')
  const sortHref = (sort: CustomerSort, dir: SortDir): string => customersHref(query, { sort, dir })
  return (
    <>
      <table aria-label={t('title')} className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] @4xl:table">
        <colgroup>
          <col />
          <col className="w-60" />
          <col className="w-24" />
          <col className="w-32" />
          <col className="w-40" />
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <SortHeader query={query} sort="name" first={FIRST_DIR.name} href={sortHref} label={t('columns.customer')} />
            <th scope="col" className={TH}>{t('columns.location')}</th>
            <SortHeader query={query} sort="orders" first={FIRST_DIR.orders} href={sortHref} label={t('columns.orders')} align="right" />
            <SortHeader query={query} sort="spent" first={FIRST_DIR.spent} href={sortHref} label={t('columns.spent')} align="right" />
            <SortHeader query={query} sort="last" first={FIRST_DIR.last} href={sortHref} label={t('columns.last')} />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="group/row relative hover:bg-secondary">
              <td className={TD}>
                <span className="flex min-w-0 flex-col">
                  <Link href={row.href} prefetch={false} className={cn(ROW_LINK, 'font-medium truncate')}>{row.name}</Link>
                  <span className="truncate text-xs text-muted-foreground">{row.email}</span>
                </span>
              </td>
              <td className={cn(TD, 'truncate')}>{row.location ?? '—'}</td>
              <td className={cn(TD, 'text-right tabular-nums')}>{row.ordersText}</td>
              <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>{row.spent}</td>
              <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{row.last ?? t('noOrders')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={t('title')} className="flex flex-col @4xl:hidden">
        {rows.map(row => (
          <li key={row.id} className="group/row relative flex flex-col gap-1 border-b px-3 py-3 last:border-b-0 hover:bg-secondary">
            <div className="flex items-start justify-between gap-3">
              <Link href={row.href} prefetch={false} className={cn(ROW_LINK, 'font-medium min-w-0 text-sm break-words')}>{row.name}</Link>
              <span className="shrink-0 text-sm font-medium tabular-nums">{row.spent}</span>
            </div>
            <span className="text-xs break-all text-muted-foreground">{row.email}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {row.last ? t('cardOrders', { count: row.orders, last: row.last }) : t('noOrders')}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
