import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { AttentionStrip } from '@/components/overview/attention-strip'
import { KpiCard, type KpiView } from '@/components/overview/kpi-card'
import { PeriodNav } from '@/components/overview/period-nav'
import type { Locale } from '@/i18n/locale'
import { formatDayRange, formatMoney, formatNumber, formatPercent } from '@/lib/intl'
import type { SearchParams } from '@/lib/orders/query'
import { kpis, type Kpi } from '@/lib/overview/kpi'
import { lastMoment, parsePeriod, periodPlan, type Range } from '@/lib/periods'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { attentionCounts, revenueTotals } from '@/server/dal/overview'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('overview')
  return { title: t('title') }
}

type Format = (value: number) => string

/** The strings of one card; "—" for a change the previous period cannot give (spec §8.1). */
function view(id: string, label: string, hint: string, kpi: Kpi, format: Format, locale: Locale): KpiView {
  const trend = kpi.change === null ? null : kpi.change > 0 ? 'up' : kpi.change < 0 ? 'down' : 'flat'
  return {
    id,
    label,
    hint,
    value: kpi.value === null ? '—' : format(kpi.value),
    change: kpi.change === null ? '—' : formatPercent(kpi.change, locale),
    trend,
    previous: kpi.previous === null ? '—' : format(kpi.previous),
  }
}

// Every page checks the session itself: a layout does not re-run on client navigation.
export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession()
  authorize(session, 'data.read')
  const period = parsePeriod((await searchParams).period)
  const now = new Date()
  const data = await withWorkspace(workspaceContext(session), async tx => {
    const settings = await getStoreSettings(tx, session.workspaceId)
    const plan = periodPlan(period, now, settings.timezone)
    return {
      timeZone: settings.timezone,
      plan,
      current: await revenueTotals(tx, session.workspaceId, plan.current),
      previous: await revenueTotals(tx, session.workspaceId, plan.previous),
      attention: await attentionCounts(tx, session.workspaceId),
    }
  })
  const locale = await getLocale()
  const t = await getTranslations('overview')
  const range = (r: Range): string => formatDayRange(r.start, lastMoment(r), locale, data.timeZone)
  const cards = kpis(data.current, data.previous)
  const whole: Format = cents => formatMoney(cents, locale, 'whole')
  const cents: Format = value => formatMoney(value, locale)
  const number: Format = value => formatNumber(value, locale)
  const figures = [
    view('revenue', t('kpis.revenue'), t('kpis.revenueHint'), cards.revenue, whole, locale),
    view('orders', t('kpis.orders'), t('kpis.ordersHint'), cards.orders, number, locale),
    view('average', t('kpis.averageOrder'), t('kpis.averageOrderHint'), cards.averageOrder, cents, locale),
    view('customers', t('kpis.newCustomers'), t('kpis.newCustomersHint'), cards.newCustomers, number, locale),
  ]
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t('compared', { current: range(data.plan.current), previous: range(data.plan.previous) })}</p>
        </div>
        <PeriodNav period={period} />
      </div>
      <AttentionStrip counts={data.attention} />
      <section aria-label={t('kpis.label')} className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {figures.map(kpi => <KpiCard key={kpi.id} kpi={kpi} />)}
      </section>
    </div>
  )
}
