import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PageSizeSelect } from '@/components/orders/page-size-select'
import { ordersHref, type OrdersQuery } from '@/lib/orders/query'
import { pageWindow } from '@/lib/orders/view'
import { cn } from '@/lib/utils'

const PAGE = 'grid h-[30px] min-w-[30px] place-items-center rounded-md px-1 text-ink-2 hover:bg-muted hover:text-foreground'
const CURRENT = 'bg-selected text-selected-foreground hover:bg-selected hover:text-selected-foreground'
const OFF = 'grid h-[30px] min-w-[30px] place-items-center text-border-strong'

export function Pager({ query, filtered, pages }: { query: OrdersQuery; filtered: number; pages: number }) {
  const t = useTranslations('orders.pager')
  const from = (query.page - 1) * query.size + 1
  const to = Math.min(query.page * query.size, filtered)
  return (
    <nav aria-label={t('label')} className="flex flex-wrap items-center gap-3 px-3 pt-3 text-[13px] text-muted-foreground">
      <span className="tabular-nums">{t('range', { from, to, total: filtered })}</span>
      <span className="flex-1" />
      <ul className="flex items-center gap-1">
        <li>
          {query.page > 1 ? (
            <Link href={ordersHref(query, { page: query.page - 1 })} aria-label={t('previous')} className={PAGE}><ChevronLeft aria-hidden className="size-4" /></Link>
          ) : (
            <span aria-hidden className={OFF}><ChevronLeft className="size-4" /></span>
          )}
        </li>
        {pageWindow(query.page, pages).map(n => (
          <li key={n}>
            <Link
              href={ordersHref(query, { page: n })}
              aria-label={t('page', { page: n })}
              aria-current={n === query.page ? 'page' : undefined}
              className={cn(PAGE, 'tabular-nums', n === query.page && CURRENT)}
            >
              {n}
            </Link>
          </li>
        ))}
        <li>
          {query.page < pages ? (
            <Link href={ordersHref(query, { page: query.page + 1 })} aria-label={t('next')} className={PAGE}><ChevronRight aria-hidden className="size-4" /></Link>
          ) : (
            <span aria-hidden className={OFF}><ChevronRight className="size-4" /></span>
          )}
        </li>
      </ul>
      <PageSizeSelect query={query} />
    </nav>
  )
}
