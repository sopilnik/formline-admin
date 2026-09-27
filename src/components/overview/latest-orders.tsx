import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ORDER_LINK } from '@/components/orders/row-link'
import { StatusBadge } from '@/components/orders/status-badge'
import type { OrderRowView } from '@/lib/orders/view'
import { cn } from '@/lib/utils'

const TH = 'h-9 border-b px-3 text-left font-medium whitespace-nowrap text-muted-foreground first:pl-0'
const TD = 'h-11 border-b px-3 first:pl-0 group-last/row:border-b-0'

/** The eight newest orders (spec §8.1), in the columns and order of the orders table. */
export function LatestOrders({ rows }: { rows: OrderRowView[] }) {
  const t = useTranslations('overview.latest')
  const columns = useTranslations('orders.columns')
  return (
    <section aria-labelledby="latest-title" className="flex min-w-0 flex-col rounded-lg border bg-card p-5">
      <div className="mb-2 flex items-baseline gap-2.5">
        <h2 id="latest-title" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        <Link href="/orders" className="ml-auto text-[13px] font-medium text-primary hover:underline">{t('all')}</Link>
      </div>
      <div className="overflow-x-auto">
        <table aria-labelledby="latest-title" className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>{columns('order')}</th>
              <th scope="col" className={TH}>{columns('placed')}</th>
              <th scope="col" className={TH}>{columns('customer')}</th>
              <th scope="col" className={cn(TH, 'text-right')}>{columns('total')}</th>
              <th scope="col" className={TH}>{columns('status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="group/row relative hover:bg-secondary">
                <td className={cn(TD, 'tabular-nums')}><Link href={row.href} prefetch={false} className={ORDER_LINK}>#{row.number}</Link></td>
                <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{row.placed}</td>
                <td className={cn(TD, 'max-w-48 truncate')}>{row.customerName}</td>
                <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>{row.total}</td>
                <td className={TD}><StatusBadge status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
