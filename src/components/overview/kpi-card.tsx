import { Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** One KPI as the page formats it: every string ready, `trend` for the colour of the change. */
export type KpiView = { id: string; label: string; hint: string; value: string; change: string; trend: 'up' | 'down' | 'flat' | null; previous: string }

export function KpiCard({ kpi }: { kpi: KpiView }) {
  const t = useTranslations('overview.kpis')
  const labelId = `kpi-${kpi.id}-label`
  const hintId = `kpi-${kpi.id}-hint`
  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-1 text-muted-foreground">
        <h2 id={labelId} className="font-sans text-[13px] font-normal">{kpi.label}</h2>
        <Tooltip>
          <TooltipTrigger
            render={<button type="button" aria-label={t('about', { label: kpi.label.toLowerCase() })} aria-describedby={hintId} className="grid size-6 place-items-center rounded-full hover:text-foreground" />}
          >
            <Info aria-hidden className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{kpi.hint}</TooltipContent>
        </Tooltip>
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
