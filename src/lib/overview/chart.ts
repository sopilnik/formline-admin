import type { Locale } from '@/i18n/locale'
import { formatDay, formatDayRange, formatMoney } from '@/lib/intl'
import { lastMoment, type PeriodPlan, type Range } from '@/lib/periods'

/** One bucket as the chart draws it: cents, and every string it shows, formatted on the server. */
export type ChartBar = {
  value: number
  /** The same bucket in the previous period; null where that period has no such day. */
  previous: number | null
  label: string
  previousLabel: string | null
  amount: string
  previousAmount: string | null
  today: boolean
}

export type ChartTick = { index: number; label: string; alternate: boolean }
export type ChartModel = { bars: ChartBar[]; max: number; grid: { fraction: number; label: string }[]; ticks: ChartTick[] }

const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/** The smallest round step — 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10^k cents, at least $10 — that reaches `value`. */
export function niceStep(value: number): number {
  if (value <= 1000) return 1000

  const magnitude = 10 ** Math.floor(Math.log10(value))

  return STEPS.map(m => m * magnitude).find(step => step >= value) ?? 10 * magnitude
}

/** Three round steps above the largest value of both periods, so the grid reads 0, ⅓, ⅔ and the top. */
export function scaleTop(values: readonly (number | null)[]): number {
  const largest = Math.max(0, ...values.map(value => value ?? 0))

  return 3 * niceStep(largest / 3)
}

/**
 * The labeled buckets: every day on 7 days; weekly, ending on today, on 30 days and
 * this month; every week on 90 days. Every other label, counted back from today's, is `alternate`:
 * a narrow chart hides those, so its labels never run into each other and today's always shows.
 */
export function tickIndexes(plan: Pick<PeriodPlan, 'period' | 'buckets'>): { index: number; alternate: boolean }[] {
  const last = plan.buckets.length - 1
  const everyBucket = plan.period === '7d' || plan.period === '90d'
  const indexes: number[] = []

  for (let index = last; index >= 0; index -= everyBucket ? 1 : 7) indexes.unshift(index)

  return indexes.map((index, k) => ({ index, alternate: (indexes.length - 1 - k) % 2 === 1 }))
}

export function buildChart(input: {
  plan: PeriodPlan
  current: readonly (number | null)[]
  previous: readonly (number | null)[]
  locale: Locale
  timeZone: string
}): ChartModel {
  const { plan, locale, timeZone } = input
  const week = plan.step === 'week'
  // A day by its date; a week by its range in the tooltip and the table, by its last day on the axis.
  const name = (range: Range): string => (week ? formatDayRange({ start: range.start, endInclusive: lastMoment(range) }, locale, timeZone) : formatDay(range.start, locale, timeZone))
  const bars = plan.buckets.map((bucket, i): ChartBar => {
    const value = input.current[i] ?? 0
    const previousBucket = plan.previousBuckets[i] ?? null
    const previous = previousBucket ? (input.previous[i] ?? 0) : null

    return {
      value,
      previous,
      label: name(bucket),
      previousLabel: previousBucket ? name(previousBucket) : null,
      amount: formatMoney(value, locale, 'whole'),
      previousAmount: previous === null ? null : formatMoney(previous, locale, 'whole'),
      today: i === plan.buckets.length - 1,
    }
  })
  const max = scaleTop([...bars.map(bar => bar.value), ...bars.map(bar => bar.previous)])
  const grid = [0, 1, 2, 3].map(step => ({ fraction: step / 3, label: formatMoney((max * step) / 3, locale, 'whole') }))
  const ticks = tickIndexes(plan).map(({ index, alternate }) => {
    const bucket = plan.buckets[index]!

    return { index, alternate, label: formatDay(week ? lastMoment(bucket) : bucket.start, locale, timeZone) }
  })

  return { bars, max, grid, ticks }
}
