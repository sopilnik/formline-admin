import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ProductThumb } from '@/components/products/product-thumb'
import { DEFAULT_PRODUCTS_QUERY, productsHref } from '@/lib/products/query'
import { cn } from '@/lib/utils'

/** One low-stock variant as the page formats it. */
type LowStockView = { key: string; href: string; product: string; variant: string; stock: number; imageSrc: string | null }

/** Variants at or below their threshold: sold out first, at most five, then "View all N". */
export function LowStock({ rows, total }: { rows: LowStockView[]; total: number }) {
  const t = useTranslations('overview.lowStock')

  return (
    <section aria-labelledby="low-stock-title" className="flex min-w-0 flex-col rounded-lg border bg-card p-4 sm:p-5">
      <div className="mb-1 flex items-baseline gap-2.5">
        <h2 id="low-stock-title" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        {total > 0 ? <span className="text-[13px] text-muted-foreground">{t('count', { count: total })}</span> : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map(row => (
            <li key={row.key} className="flex items-center gap-3 border-b py-2 text-[13px]">
              <ProductThumb src={row.imageSrc} />
              <span className="min-w-0 flex-1">
                <Link href={row.href} prefetch={false} className="font-medium underline decoration-border-strong underline-offset-3 hover:decoration-current">{row.product}</Link>
                <small className="block text-xs text-muted-foreground">{row.variant}</small>
              </span>
              <span className={cn('font-semibold whitespace-nowrap', row.stock === 0 ? 'text-status-bad' : 'text-status-warn')}>
                {row.stock === 0 ? t('soldOut') : t('left', { count: row.stock })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {total > 0 ? (
        <Link href={productsHref(DEFAULT_PRODUCTS_QUERY, { stock: 'low' })} prefetch={false} className="mt-auto w-fit pt-3 text-[13px] font-medium text-primary hover:underline">
          {t('viewAll', { count: total })}
        </Link>
      ) : null}
    </section>
  )
}
