import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/** One collection as the page formats it; `bar` is its revenue relative to the largest collection. */
export type CollectionRow = { slug: string; name: string; posters: number; amount: string; share: string; bar: number }

// The store's collection colours (spec §11); a collection added later falls back to the chart ink.
const COLOURS: Record<string, string> = {
  monochrome: 'bg-collection-mono',
  primary: 'bg-collection-primary',
  pastel: 'bg-collection-pastel',
  night: 'bg-collection-night',
}

type Props = { rows: CollectionRow[]; other: string | null; posters: string; shipping: string }

/** Revenue by collection (spec §8.1): an HTML list; the bars are decoration, the numbers are text. */
export function CollectionRevenue({ rows, other, posters, shipping }: Props) {
  const t = useTranslations('overview.collections')
  return (
    <section aria-labelledby="collections-title" className="flex min-w-0 flex-col rounded-lg border bg-card p-4 sm:p-5">
      <h2 id="collections-title" className="mb-3.5 font-sans text-[15px] font-semibold">{t('title')}</h2>
      <ul className="mb-4 grid grid-cols-[fit-content(50%)_minmax(2.5rem,1fr)_auto] items-center gap-x-3 gap-y-4.5 text-[13px]">
        {rows.map(row => (
          <li key={row.slug} className="col-span-3 grid grid-cols-subgrid items-center">
            <span className="min-w-[5.75rem]">
              <span className="block">{row.name}</span>
              <small className="block text-xs text-muted-foreground">{t('posters', { count: row.posters })}</small>
            </span>
            <span aria-hidden className="h-2.5">
              <span className={cn('block h-full rounded-[3px]', COLOURS[row.slug] ?? 'bg-chart-ink')} style={{ width: `${(row.bar * 100).toFixed(1)}%` }} />
            </span>
            <span className="text-right tabular-nums">
              {row.amount}
              <small className="block text-xs text-muted-foreground">{row.share}</small>
            </span>
          </li>
        ))}
        {other !== null ? (
          <li className="col-span-3 grid grid-cols-subgrid items-center">
            <span>{t('other')}</span>
            <span aria-hidden />
            <span className="text-right tabular-nums">{other}</span>
          </li>
        ) : null}
      </ul>
      <p className="mt-auto flex flex-wrap gap-x-4.5 gap-y-1 border-t pt-3.5 text-[13px] text-muted-foreground tabular-nums">
        <span>{t('postersTotal')} <b className="font-semibold text-foreground">{posters}</b></span>
        <span>{t('shipping')} <b className="font-semibold text-foreground">{shipping}</b></span>
      </p>
    </section>
  )
}
