import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ORDER_LINK } from '@/components/orders/row-link'
import { StatusBadge } from '@/components/orders/status-badge'
import type { OrderRowView } from '@/lib/orders/view'
import { cn } from '@/lib/utils'

const TH = 'h-9 border-b px-3 text-left font-medium whitespace-nowrap text-muted-foreground first:pl-0'
const TD = 'h-11 border-b px-3 first:pl-0 group-last/row:border-b-0'

/**
 * The eight newest orders (spec §8.1), in the columns and order of the orders table. The five columns need about
 * 560 px, so below 36 rem of the card's own width the rows become a two-line list, as the orders page becomes cards.
 */
export function LatestOrders({ rows }: { rows: OrderRowView[] }) {
  const t = useTranslations('overview.latest')
  const columns = useTranslations('orders.columns')
  return (
    <section aria-labelledby="latest-title" className="@container flex min-w-0 flex-col rounded-lg border bg-card p-5">
      <div className="mb-2 flex items-baseline gap-2.5">
        <h2 id="latest-title" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        <Link href="/orders" className="ml-auto text-[13px] font-medium text-primary hover:underline">{t('all')}</Link>
      </div>
      <div className="hidden overflow-x-auto @xl:block">
        <table aria-labelledby="latest-title" className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>{columns('order')}</th>
              <th scope="col" className={TH}>{columns('placed')}</th>
              <th scope="col" className={TH}>{columns('customer')}</th>
              {/* The status column takes the spare width, so its centred chip sits midway between the name and the total. */}
              <th scope="col" className={cn(TH, 'w-full text-center')}>{columns('status')}</th>
              <th scope="col" className={cn(TH, 'text-right')}>{columns('total')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="group/row relative hover:bg-secondary">
                <td className={cn(TD, 'tabular-nums')}><Link href={row.href} prefetch={false} className={ORDER_LINK}>#{row.number}</Link></td>
                <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{row.placed}</td>
                <td className={cn(TD, 'max-w-48 truncate')}>{row.customerName}</td>
                <td className={cn(TD, 'text-center')}><StatusBadge status={row.status} /></td>
                <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={t('title')} className="flex flex-col @xl:hidden">
        {rows.map(row => (
          <li key={row.id} className="group/row relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b py-2.5 last:border-b-0 hover:bg-secondary">
            <div className="flex min-w-0 items-baseline gap-2 text-[13px]">
              <Link href={row.href} prefetch={false} className={cn(ORDER_LINK, 'tabular-nums')}>#{row.number}</Link>
              <span className="truncate">{row.customerName}</span>
            </div>
            <div className="row-span-2 flex flex-col items-end gap-1">
              <span className="text-[13px] font-semibold tabular-nums">{row.total}</span>
              <StatusBadge status={row.status} />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{row.placed}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
