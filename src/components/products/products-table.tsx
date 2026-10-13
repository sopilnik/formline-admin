import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ROW_LINK } from '@/components/app/row-link'
import { SortHeader, type SortDir } from '@/components/app/sort-header'
import { ProductStatusBadge } from '@/components/products/product-status-badge'
import { ProductThumb } from '@/components/products/product-thumb'
import { FIRST_DIR, productsHref, type ProductSort, type ProductsQuery } from '@/lib/products/query'
import type { ProductRowView } from '@/lib/products/view'
import { cn } from '@/lib/utils'

const TH = 'h-10 border-b bg-card px-3 text-left font-medium whitespace-nowrap text-muted-foreground'
const TD = 'border-b px-3 py-2 group-last/row:border-b-0'

/**
 * "2 sold out · 1 low" under the stock figure; nothing when every variant is above its threshold. Stacked, each note
 * takes its own line: the table's stock column has no room for both on one ("распродано: 2 · на исходе: 1").
 */
function StockNote({ row, stacked = false }: { row: ProductRowView; stacked?: boolean }) {
  const t = useTranslations('products.stockNote')
  if (row.soldOut === 0 && row.low === 0) return null
  return (
    <span className="block text-xs whitespace-nowrap">
      {row.soldOut > 0 ? <span className={cn('text-status-bad', stacked && 'block')}>{t('soldOut', { count: row.soldOut })}</span> : null}
      {row.soldOut > 0 && row.low > 0 && !stacked ? <span aria-hidden className="text-muted-foreground"> · </span> : null}
      {row.low > 0 ? <span className={cn('text-status-warn', stacked && 'block')}>{t('low', { count: row.low })}</span> : null}
    </span>
  )
}

/**
 * The products as a table while the list is at least 56 rem wide, as cards below —
 * a container query on the list, as on the orders page.
 */
export function ProductsTable({ rows, query }: { rows: ProductRowView[]; query: ProductsQuery }) {
  const t = useTranslations('products')
  const sortHref = (sort: ProductSort, dir: SortDir): string => productsHref(query, { sort, dir })
  const price = (row: ProductRowView): string => (row.priceFrom === null ? t('noVariants') : t('priceFrom', { price: row.priceFrom }))
  return (
    <>
      <table aria-label={t('title')} className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] @4xl:table">
        <colgroup>
          <col />
          <col className="w-32" />
          {/* The status column fits the widest badge, the Russian "Опубликован" with its icon (w-32 left it 4 px outside). */}
          <col className="w-36" />
          <col className="w-28" />
          <col className="w-32" />
          <col className="w-32" />
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <SortHeader query={query} sort="name" first={FIRST_DIR.name} href={sortHref} label={t('columns.product')} />
            <th scope="col" className={TH}>{t('columns.collection')}</th>
            <th scope="col" className={TH}>{t('columns.status')}</th>
            <SortHeader query={query} sort="price" first={FIRST_DIR.price} href={sortHref} label={t('columns.price')} align="right" />
            <SortHeader query={query} sort="stock" first={FIRST_DIR.stock} href={sortHref} label={t('columns.stock')} align="right" />
            <SortHeader query={query} sort="updated" first={FIRST_DIR.updated} href={sortHref} label={t('columns.updated')} />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="group/row relative hover:bg-secondary">
              <td className={TD}>
                <span className="flex items-center gap-3">
                  <ProductThumb src={row.imageSrc} />
                  <Link href={row.href} prefetch={false} className={cn(ROW_LINK, 'font-medium min-w-0 truncate')}>{row.name}</Link>
                </span>
              </td>
              <td className={cn(TD, 'truncate')}>{row.collection}</td>
              <td className={TD}><ProductStatusBadge status={row.status} /></td>
              <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>{row.priceFrom ?? t('noVariants')}</td>
              <td className={cn(TD, 'text-right tabular-nums')}>
                {row.stock}
                <StockNote row={row} stacked />
              </td>
              <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{row.updated}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={t('title')} className="flex flex-col @4xl:hidden">
        {rows.map(row => (
          <li key={row.id} className="group/row relative flex items-start gap-3 border-b px-3 py-3 last:border-b-0 hover:bg-secondary">
            <ProductThumb src={row.imageSrc} size="md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <Link href={row.href} prefetch={false} className={cn(ROW_LINK, 'font-medium min-w-0 text-sm')}>{row.name}</Link>
                <ProductStatusBadge status={row.status} />
              </div>
              <span className="text-xs text-muted-foreground">{`${row.collection} · ${price(row)}`}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('inStock', { stock: row.stock })}
                <StockNote row={row} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
