import { useTranslations } from 'next-intl'
import { MetricHint } from '@/components/overview/metric-hint'
import type { Trend } from '@/lib/overview/kpi'
import { cn } from '@/lib/utils'

/** One KPI as the page formats it: every string ready, `trend` for the colour of the change. */
export type KpiView = { id: string; label: string; hint: string; value: string; change: string; trend: Trend | null; previous: string }

export function KpiCard({ kpi }: { kpi: KpiView }) {
  const t = useTranslations('overview.kpis')
  const labelId = `kpi-${kpi.id}-label`
  const hintId = `kpi-${kpi.id}-hint`
  return (
    <div role="group" aria-labelledby={labelId} className="row-span-3 grid min-w-0 grid-rows-subgrid gap-y-0 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-1 text-muted-foreground">
        <h2 id={labelId} className="pt-0.5 font-sans text-[13px] font-normal">{kpi.label}</h2>
        <MetricHint label={t('about', { label: kpi.label.toLowerCase() })} hint={kpi.hint} describedBy={hintId} />
        <span id={hintId} className="sr-only">{kpi.hint}</span>
      </div>
      <p className="my-1.5 font-brand text-2xl leading-tight font-bold tracking-tight tabular-nums sm:text-3xl">{kpi.value}</p>
      <p className="text-[13px] text-muted-foreground">
        <b className={cn('font-semibold tabular-nums', kpi.trend === 'up' && 'text-status-ok', kpi.trend === 'down' && 'text-status-bad')}>{kpi.change}</b>
        {' '}
        {t('versus', { previous: kpi.previous })}
      </p>
    </div>
  )
}
