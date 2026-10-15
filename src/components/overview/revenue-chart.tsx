'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { ChartBar, ChartModel } from '@/lib/overview/chart'
import { cn } from '@/lib/utils'

const pct = (fraction: number): string => `${(fraction * 100).toFixed(3)}%`

// Today's bar: primary stripes over the card, drawn by CSS so they keep their angle at every width.
const TODAY = 'border border-primary bg-[image:repeating-linear-gradient(135deg,var(--primary)_0_1.5px,transparent_1.5px_4px)]'

/** The previous period as polyline point lists, split where the previous month has no such day. */
function segments(bars: readonly ChartBar[], max: number): string[] {
  const lists: string[][] = [[]]

  bars.forEach((bar, i) => {
    if (bar.previous === null) {
      if (lists.at(-1)!.length > 0) lists.push([])

      return
    }
    lists.at(-1)!.push(`${i + 0.5},${(100 - (Math.min(bar.previous, max) / max) * 100).toFixed(3)}`)
  })

  return lists.filter(list => list.length > 1).map(list => list.join(' '))
}

type Props = { model: ChartModel; title: string; summary: string; legend: { current: string; previous: string } }

// How close to an edge the tooltip may start before it is anchored to that edge, as a fraction of the chart's width.
const TOOLTIP_EDGE = 0.2

/** Keeps the tooltip inside the chart: anchored left near the left edge, right near the right edge, centered between. */
function tooltipShift(at: number): string {
  if (at < TOOLTIP_EDGE) {
    return 'translate-x-0'
  }

  return at > 1 - TOOLTIP_EDGE ? '-translate-x-full' : '-translate-x-1/2'
}

/**
 * Revenue by day or week: graphite bars, today's bar hatched, the previous
 * period as a dashed line over an under-stroke in the card color. "Show as table" swaps
 * the plot for the same numbers as a table.
 */
export function RevenueChart({ model, title, summary, legend }: Props) {
  const t = useTranslations('overview.chart')
  const [asTable, setAsTable] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const count = model.bars.length
  const lines = segments(model.bars, model.max)
  const hovered = active === null ? null : model.bars[active]!
  const at = active === null ? 0 : (active + 0.5) / count

  return (
    <section aria-labelledby="revenue-title" className="@container flex min-w-0 flex-col rounded-lg border bg-card p-4 sm:p-5">
      <div className="mb-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <h2 id="revenue-title" className="font-sans text-[15px] font-semibold">{title}</h2>
          <span className="text-[13px] text-muted-foreground">USD</span>
        </div>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable(value => !value)}
          className="ml-auto rounded-sm text-[13px] font-medium whitespace-nowrap text-primary hover:underline"
        >
          {t('showTable')}
        </button>
      </div>
      {asTable ? (
        <div role="region" aria-label={t('tableLabel', { title })} tabIndex={0} className="max-h-[260px] overflow-y-auto">
          <table aria-label={title} className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th scope="col" className="h-8 border-b px-2 text-left font-medium text-muted-foreground">{t('bucket')}</th>
                <th scope="col" className="h-8 border-b px-2 text-right font-medium text-muted-foreground">{legend.current}</th>
                <th scope="col" className="h-8 border-b px-2 text-right font-medium text-muted-foreground">{legend.previous}</th>
              </tr>
            </thead>
            <tbody>
              {model.bars.map((bar, i) => (
                <tr key={i}>
                  <th scope="row" className="h-8 border-b px-2 text-left font-normal">{bar.today ? `${bar.label} (${t('todaySoFar')})` : bar.label}</th>
                  <td className="h-8 border-b px-2 text-right">{bar.amount}</td>
                  <td className="h-8 border-b px-2 text-right text-muted-foreground">{bar.previousAmount ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={summary} className="grid h-[220px] grid-cols-[3rem_1fr] grid-rows-[1fr_1.5rem]">
          <div aria-hidden className="relative">
            {model.grid.map(line => (
              <span key={line.fraction} className="absolute right-2 translate-y-1/2 text-[11px] leading-none text-muted-foreground tabular-nums" style={{ bottom: pct(line.fraction) }}>
                {line.label}
              </span>
            ))}
          </div>
          <div aria-hidden className="relative" onPointerLeave={() => setActive(null)}>
            {model.grid.map(line => <span key={line.fraction} className="absolute inset-x-0 border-t" style={{ bottom: pct(line.fraction) }} />)}
            <div className="absolute inset-0 flex items-end">
              {model.bars.map((bar, i) => (
                <div key={i} data-bucket={i} className="flex h-full flex-1 items-end justify-center" onPointerEnter={() => setActive(i)}>
                  <div
                    className={cn('w-[64%] rounded-t-[2px]', bar.today ? TODAY : 'bg-chart-ink', active !== null && active !== i && 'opacity-60')}
                    style={{ height: pct(Math.min(bar.value, model.max) / model.max) }}
                  />
                </div>
              ))}
            </div>
            <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${count} 100`} preserveAspectRatio="none">
              {lines.map(points => (
                <g key={points}>
                  <polyline points={points} fill="none" stroke="var(--card)" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <polyline points={points} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>
              ))}
            </svg>
            {hovered ? (
              <div
                className={cn(
                  'pointer-events-none absolute top-0 z-10 rounded-md bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow-md',
                  tooltipShift(at),
                )}
                style={{ left: pct(at) }}
              >
                <p><b className="tabular-nums">{hovered.amount}</b>{` · ${hovered.label}${hovered.today ? ` (${t('todaySoFar')})` : ''}`}</p>
                {hovered.previousAmount !== null ? <p className="opacity-80"><span className="tabular-nums">{hovered.previousAmount}</span>{` · ${hovered.previousLabel}`}</p> : null}
              </div>
            ) : null}
          </div>
          <div />
          <div aria-hidden className="relative">
            {model.ticks.map(tick => (
              <span
                key={tick.index}
                className={cn(
                  'absolute top-1.5 text-[11px] leading-none whitespace-nowrap text-muted-foreground',
                  tick.index === count - 1 ? 'right-0' : '-translate-x-1/2',
                  tick.alternate && '@max-lg:hidden',
                )}
                style={tick.index === count - 1 ? undefined : { left: pct((tick.index + 0.5) / count) }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4.5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-[2px] bg-chart-ink" />{legend.current}</span>
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden viewBox="0 0 22 10" className="h-2.5 w-[22px]"><line x1="0" y1="5" x2="22" y2="5" stroke="var(--ink-2)" strokeWidth="2" strokeDasharray="5 4" /></svg>
          {legend.previous}
        </span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className={cn('h-2.5 w-4 rounded-[2px]', TODAY)} />{t('todayLegend')}</span>
      </div>
    </section>
  )
}
