import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { PageSizeSelect } from '@/components/app/page-size-select'
import { PAGE_SIZES, pageWindow, type PageSize } from '@/lib/pagination'
import { cn } from '@/lib/utils'

const PAGE = 'grid h-[30px] min-w-[30px] place-items-center rounded-md px-1 text-ink-2 hover:bg-muted hover:text-foreground'
const CURRENT = 'bg-selected text-selected-foreground hover:bg-selected hover:text-selected-foreground'
const OFF = 'grid h-[30px] min-w-[30px] place-items-center text-border-strong'

type Props = {
  /** The list's own words ("Orders per page", "Customers per page"); the other keys read the same. */
  namespace: 'orders.pager' | 'products.pager' | 'customers.pager' | 'outbox.pager' | 'activity.pager' | 'notifications.pager'
  /** The id of the page-size select. */
  sizeId: string
  page: number
  pages: number
  size: PageSize
  /** The rows the filters keep, over every page. */
  filtered: number
  /** The list's link with the page or the page size changed. */
  href: (changes: { page?: number; size?: PageSize }) => string
}

/** The pager under a list: the range shown, up to five page links and the page size. */
export function Pager({ namespace, sizeId, page, pages, size, filtered, href }: Props) {
  const t = useTranslations(namespace)
  const from = (page - 1) * size + 1
  const to = Math.min(page * size, filtered)
  return (
    <nav aria-label={t('label')} className="flex flex-wrap items-center gap-3 px-3 pt-3 text-[13px] text-muted-foreground">
      <span className="tabular-nums">{t('range', { from, to, total: filtered })}</span>
      <span className="flex-1" />
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={href({ page: page - 1 })} aria-label={t('previous')} className={PAGE}><ChevronLeft aria-hidden className="size-4" /></Link>
          ) : (
            <span aria-hidden className={OFF}><ChevronLeft className="size-4" /></span>
          )}
        </li>
        {pageWindow(page, pages).map(n => (
          <li key={n}>
            <Link
              href={href({ page: n })}
              aria-label={t('page', { page: n })}
              aria-current={n === page ? 'page' : undefined}
              className={cn(PAGE, 'tabular-nums', n === page && CURRENT)}
            >
              {n}
            </Link>
          </li>
        ))}
        <li>
          {page < pages ? (
            <Link href={href({ page: page + 1 })} aria-label={t('next')} className={PAGE}><ChevronRight aria-hidden className="size-4" /></Link>
          ) : (
            <span aria-hidden className={OFF}><ChevronRight className="size-4" /></span>
          )}
        </li>
      </ul>
      <PageSizeSelect
        id={sizeId}
        label={t('size')}
        value={size}
        options={PAGE_SIZES.map(option => ({ size: option, label: t('sizeOption', { size: option }), href: href({ size: option }) }))}
      />
    </nav>
  )
}
