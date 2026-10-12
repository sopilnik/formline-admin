import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { AttentionStrip } from '@/components/overview/attention-strip'
import { CollectionRevenue } from '@/components/overview/collection-revenue'
import { KpiCard, type KpiView } from '@/components/overview/kpi-card'
import { LatestOrders } from '@/components/overview/latest-orders'
import { LowStock } from '@/components/overview/low-stock'
import { PeriodNav } from '@/components/overview/period-nav'
import { RevenueChart } from '@/components/overview/revenue-chart'
import type { Locale } from '@/i18n/locale'
import { imageSrc, variantLabel } from '@/lib/catalog'
import { formatDayRange, formatMoney, formatNumber, formatPercent, formatShare } from '@/lib/intl'
import { toOrderRowView } from '@/lib/orders/view'
import { buildChart } from '@/lib/overview/chart'
import { bucketSums, collectionShares, kpis, trendOf, type Kpi } from '@/lib/overview/kpi'
import { lastMoment, parsePeriod, periodPlan, type Range } from '@/lib/periods'
import { productHref } from '@/lib/products/view'
import type { SearchParams } from '@/lib/search-params'
import { requireSession } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { latestOrders } from '@/server/dal/orders'
import { attentionCounts, collectionRevenue, lowStock, revenuePoints, revenueTotals } from '@/server/dal/overview'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('overview')
  return { title: t('title') }
}

type Format = (value: number) => string

/** The strings of one card; "—" for a change the previous period cannot give (spec §8.1). */
function kpiView(id: string, label: string, hint: string, kpi: Kpi, format: Format, locale: Locale): KpiView {
  return {
    id,
    label,
    hint,
    value: kpi.value === null ? '—' : format(kpi.value),
    change: kpi.change === null ? '—' : formatPercent(kpi.change, locale),
    trend: trendOf(kpi.change),
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
      points: await revenuePoints(tx, session.workspaceId, { start: plan.previous.start, end: plan.current.end }),
      collections: await collectionRevenue(tx, session.workspaceId, plan.current),
      latest: await latestOrders(tx, session.workspaceId),
      stock: await lowStock(tx, session.workspaceId),
    }
  })
  const { plan, timeZone } = data
  const locale = await getLocale()
  const t = await getTranslations('overview')
  const range = (r: Range): string => formatDayRange(r.start, lastMoment(r), locale, timeZone)
  const cards = kpis(data.current, data.previous)
  const whole: Format = cents => formatMoney(cents, locale, 'whole')
  const cents: Format = value => formatMoney(value, locale)
  const number: Format = value => formatNumber(value, locale)
  const figures = [
    kpiView('revenue', t('kpis.revenue'), t('kpis.revenueHint'), cards.revenue, whole, locale),
    kpiView('orders', t('kpis.orders'), t('kpis.ordersHint'), cards.orders, number, locale),
    kpiView('average', t('kpis.averageOrder'), t('kpis.averageOrderHint'), cards.averageOrder, cents, locale),
    kpiView('customers', t('kpis.newCustomers'), t('kpis.newCustomersHint'), cards.newCustomers, number, locale),
  ]

  const chartTitle = t('chart.title', { step: plan.step })
  const change = cards.revenue.change
  const summary = t('chart.summary', {
    title: chartTitle,
    range: range(plan.current),
    amount: whole(data.current.revenueCents),
    trend: trendOf(change) ?? 'none',
    percent: change === null ? '' : formatShare(Math.abs(change), locale, 1),
  })
  const model = buildChart({ plan, current: bucketSums(data.points, plan.buckets), previous: bucketSums(data.points, plan.previousBuckets), locale, timeZone })
  const shares = collectionShares(data.collections.rows, data.collections.postersCents)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        {/* A basis, not flex-1: with a basis of 0 the title block shrinks to a sliver beside the period links instead of wrapping them. */}
        <div className="min-w-0 grow basis-64">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t('compared', { current: range(plan.current), previous: range(plan.previous) })}</p>
        </div>
        <PeriodNav period={period} />
      </div>
      <AttentionStrip counts={data.attention} />
      <section aria-label={t('kpis.label')} className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {figures.map(kpi => <KpiCard key={kpi.id} kpi={kpi} />)}
      </section>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <RevenueChart model={model} title={chartTitle} summary={summary} legend={{ current: range(plan.current), previous: range(plan.previous) }} />
        <CollectionRevenue
          rows={shares.rows.map(row => ({ slug: row.slug, name: row.name, posters: row.posters, amount: whole(row.cents), share: formatShare(row.share, locale), bar: row.bar }))}
          other={shares.otherCents > 0 ? whole(shares.otherCents) : null}
          posters={whole(data.collections.postersCents)}
          shipping={whole(data.collections.shippingCents)}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <LatestOrders rows={data.latest.map(row => toOrderRowView(row, locale, timeZone))} />
        <LowStock
          total={data.stock.total}
          rows={data.stock.rows.map(row => ({
            key: row.variantId,
            href: productHref(row.productSlug),
            product: row.productName,
            variant: variantLabel(row.size, row.palette),
            stock: row.stock,
            imageSrc: row.image ? imageSrc(row.image) : null,
          }))}
        />
      </div>
    </div>
  )
}
