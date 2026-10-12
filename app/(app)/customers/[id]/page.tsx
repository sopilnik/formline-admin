import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { ROW_LINK } from '@/components/app/row-link'
import { CustomerNotesForm } from '@/components/customers/customer-notes-form'
import { StatusBadge } from '@/components/orders/status-badge'
import { locationOf } from '@/lib/customers/view'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/intl'
import { DEFAULT_ORDERS_QUERY, ordersHref } from '@/lib/orders/query'
import { orderHref } from '@/lib/orders/view'
import { cn } from '@/lib/utils'
import { requireSession } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { getCustomer } from '@/server/dal/customers'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

type Params = { params: Promise<{ id: string }> }

const parseId = (value: string): string | null => {
  const id = z.uuid().safeParse(value)
  return id.success ? id.data : null
}

// The title and the page read the same customer: one set of queries per request.
const load = cache(async (id: string) => {
  const session = await requireSession()
  return withWorkspace(workspaceContext(session), async tx => ({
    customer: await getCustomer(tx, session.workspaceId, id),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
})

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await getTranslations('customers.detail')
  const id = parseId((await params).id)
  const customer = id === null ? null : (await load(id)).customer
  return { title: customer ? customer.name : t('notFoundTitle') }
}

const CARD = 'flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-5'
const CARD_TITLE = 'font-sans text-[15px] font-semibold'

export default async function CustomerPage({ params }: Params) {
  const session = await requireSession()
  authorize(session, 'data.read')
  const id = parseId((await params).id)
  if (id === null) notFound()
  const { customer, timeZone } = await load(id)
  if (!customer) notFound()
  const locale = await getLocale()
  const t = await getTranslations('customers')
  const money = (cents: number): string => formatMoney(cents, locale)
  const location = locationOf(customer.city, customer.country, locale)
  const average = customer.revenueOrders > 0 ? money(Math.round(customer.spentCents / customer.revenueOrders)) : '—'
  const facts: [string, string][] = [
    [t('detail.orders'), formatNumber(customer.orders, locale)],
    [t('detail.spent'), money(customer.spentCents)],
    [t('detail.average'), average],
    [t('detail.first'), customer.firstOrderAt ? formatDate(customer.firstOrderAt, locale, timeZone) : '—'],
    [t('detail.last'), customer.lastOrderAt ? formatDate(customer.lastOrderAt, locale, timeZone) : '—'],
    [t('detail.since'), formatDate(customer.createdAt, locale, timeZone)],
  ]
  return (
    <div className="flex flex-col gap-5">
      <Link href="/customers" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] font-medium text-ink-2 hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />
        {t('detail.back')}
      </Link>
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight break-words">{customer.name}</h1>
        <p className="mt-1 text-[13px] wrap-anywhere text-muted-foreground">{location ? `${customer.email} · ${location}` : customer.email}</p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        {/* The summary and the notes come first on a phone; on wide screens the orders take the left column. */}
        <div className="flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-start-1">
          <section aria-labelledby="customer-facts-title" className={CARD}>
            <h2 id="customer-facts-title" className={CARD_TITLE}>{t('detail.facts')}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="customer-notes-title" className={CARD}>
            <h2 id="customer-notes-title" className={CARD_TITLE}>{t('detail.notes')}</h2>
            {can(session.role, 'customers.notes', session.workspaceKind) ? (
              <CustomerNotesForm customerId={customer.id} notes={customer.notes} />
            ) : (
              <p className={cn('text-[13px] whitespace-pre-wrap', !customer.notes && 'text-muted-foreground')}>{customer.notes || t('detail.noNotes')}</p>
            )}
          </section>
        </div>
        <section aria-labelledby="customer-orders-title" className={cn(CARD, 'lg:col-start-1 lg:row-start-1')}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="customer-orders-title" className={CARD_TITLE}>{t('detail.ordersTitle')}</h2>
            {customer.orders > 0 ? (
              <Link href={ordersHref(DEFAULT_ORDERS_QUERY, { q: customer.email })} className="text-[13px] font-medium text-primary hover:underline">
                {t('detail.inOrders', { count: customer.orders })}
              </Link>
            ) : null}
          </div>
          {customer.recent.length > 0 ? (
            <ul aria-labelledby="customer-orders-title" className="flex flex-col text-[13px]">
              {customer.recent.map(order => (
                <li key={order.id} className="group/row relative flex items-center justify-between gap-3 border-b px-1 py-2.5 last:border-b-0 hover:bg-secondary">
                  <span className="flex min-w-0 flex-col">
                    <Link href={orderHref(order.number)} prefetch={false} className={cn(ROW_LINK, 'w-fit font-semibold tabular-nums')}>#{order.number}</Link>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(order.placedAt, locale, timeZone)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-medium tabular-nums">{money(order.totalCents)}</span>
                    <StatusBadge status={order.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">{t('noOrders')}</p>
          )}
        </section>
      </div>
    </div>
  )
}
