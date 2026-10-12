import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { BackLink, CARD, CARD_TITLE } from '@/components/app/detail-page'
import { OrderNoteForm } from '@/components/orders/order-note-form'
import { OrderStatusControl } from '@/components/orders/order-status-control'
import { SourceLabel } from '@/components/orders/source-label'
import { ProductThumb } from '@/components/products/product-thumb'
import { formatDateTime, formatMoney } from '@/lib/intl'
import { cn } from '@/lib/utils'
import { requireSession } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { can } from '@/server/authz/matrix'
import { getOrder, type OrderEventDetail } from '@/server/dal/orders'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

type Params = { params: Promise<{ number: string }> }

const parseNumber = (value: string): number | null => (/^\d{1,9}$/.test(value) ? Number(value) : null)

// The title and the page read the same order: one set of queries per request.
const load = cache(async (number: number) => {
  const session = await requireSession()
  return withWorkspace(workspaceContext(session), async tx => ({
    order: await getOrder(tx, session.workspaceId, number),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
})

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await getTranslations('orders.detail')
  const number = parseNumber((await params).number)
  const order = number === null ? null : (await load(number)).order
  return { title: order ? t('title', { number: order.number }) : t('notFoundTitle') }
}

export default async function OrderPage({ params }: Params) {
  const session = await requireSession()
  authorize(session, 'data.read')
  const number = parseNumber((await params).number)
  if (number === null) notFound()
  const { order, timeZone } = await load(number)
  if (!order) notFound()
  const locale = await getLocale()
  const t = await getTranslations('orders')
  const canUpdate = can(session.role, 'orders.update', session.workspaceKind)
  const money = (cents: number): string => formatMoney(cents, locale)
  const describe = (event: OrderEventDetail): string => {
    if (event.kind === 'note') return event.note ?? ''
    if (event.from === null) return event.to ? t('detail.statusSet', { status: t(`status.${event.to}`) }) : ''
    return t('detail.statusChanged', { from: t(`status.${event.from}`), to: event.to ? t(`status.${event.to}`) : '' })
  }
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/orders">{t('detail.back')}</BackLink>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{t('detail.title', { number: order.number })}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            {t('detail.placed', { date: formatDateTime(order.placedAt, locale, timeZone) })}
            <span aria-hidden>·</span>
            <SourceLabel source={order.source} />
          </p>
        </div>
        <OrderStatusControl orderId={order.id} number={order.number} status={order.status} canUpdate={canUpdate} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="items-title" className={cn(CARD, '@container')}>
            <h2 id="items-title" className={CARD_TITLE}>{t('detail.items')}</h2>
            <table className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="h-9 border-b pr-3 text-left font-medium">{t('detail.item')}</th>
                  <th scope="col" className="hidden h-9 border-b px-3 text-right font-medium @md:table-cell">{t('detail.quantityPrice')}</th>
                  <th scope="col" className="h-9 border-b pl-3 text-right font-medium">{t('detail.lineTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map(line => (
                  <tr key={line.id}>
                    <td className="border-b py-2.5 pr-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb src={line.product?.imageSrc ?? null} />
                        <span className="min-w-0 flex-1">
                          {line.product ? (
                            <Link href={`/products/${line.product.slug}`} prefetch={false} className="font-medium underline decoration-border-strong underline-offset-3 hover:decoration-current">
                              {line.name}
                            </Link>
                          ) : (
                            <span className="font-medium">{line.name}</span>
                          )}
                          {line.sku ? <small className="block text-xs break-all text-muted-foreground">{line.sku}</small> : null}
                          <small className="block text-xs text-muted-foreground @md:hidden">{`${line.qty} × ${money(line.unitCents)}`}</small>
                          {line.unmatched ? (
                            <small className="mt-0.5 inline-block rounded-full bg-badge-refunded px-2 py-0.5 text-xs font-medium text-status-bad">{t('detail.unmatched')}</small>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="hidden border-b px-3 text-right whitespace-nowrap @md:table-cell">{`${line.qty} × ${money(line.unitCents)}`}</td>
                    <td className="border-b pl-3 text-right whitespace-nowrap">{money(line.unitCents * line.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-[13px] tabular-nums">
              <dt className="text-right text-muted-foreground">{t('detail.subtotal')}</dt>
              <dd className="text-right">{money(order.subtotalCents)}</dd>
              <dt className="text-right text-muted-foreground">{t('detail.shipping', { delivery: t(`delivery.${order.delivery}`) })}</dt>
              <dd className="text-right">{money(order.shippingCents)}</dd>
              <dt className="text-right font-semibold">{t('detail.total')}</dt>
              <dd className="text-right font-semibold">{money(order.totalCents)}</dd>
            </dl>
          </section>
          <section aria-labelledby="history-title" className={CARD}>
            <h2 id="history-title" className={CARD_TITLE}>{t('detail.history')}</h2>
            <ol className="flex flex-col gap-3 text-[13px]">
              {order.history.map(event => (
                <li key={event.id} className="flex flex-col gap-0.5 border-l-2 border-border-strong pl-3">
                  <span className="text-xs text-muted-foreground">
                    <time dateTime={event.at.toISOString()}>{formatDateTime(event.at, locale, timeZone)}</time>
                    {` · ${event.actorName ?? t('detail.system')}`}
                  </span>
                  <span className={event.kind === 'note' ? 'whitespace-pre-wrap' : 'font-medium'}>{describe(event)}</span>
                </li>
              ))}
            </ol>
            {canUpdate ? <OrderNoteForm orderId={order.id} /> : null}
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="customer-title" className={CARD}>
            <h2 id="customer-title" className={CARD_TITLE}>{t('detail.customer')}</h2>
            <p className="text-[13px]">
              <span className="block font-medium">{order.customer.name}</span>
              <span className="block break-all text-muted-foreground">{order.customer.email}</span>
              {order.customer.city ? <span className="block text-muted-foreground">{[order.customer.city, order.customer.country].filter(Boolean).join(', ')}</span> : null}
            </p>
            <Link href={`/customers/${order.customer.id}`} prefetch={false} className="w-fit text-[13px] font-medium text-primary hover:underline">
              {t('detail.customerPage')}
            </Link>
          </section>
          <section aria-labelledby="address-title" className={CARD}>
            <h2 id="address-title" className={CARD_TITLE}>{t('detail.address')}</h2>
            {order.address ? (
              <address className="text-[13px] not-italic">
                <span className="block">{order.address.name}</span>
                <span className="block">{order.address.line1}</span>
                <span className="block">{`${order.address.postalCode} ${order.address.city}`}</span>
                <span className="block">{order.address.country}</span>
              </address>
            ) : (
              <p className="text-[13px] text-muted-foreground">{t(order.source === 'stripe' ? 'detail.notCollected' : 'detail.noAddress')}</p>
            )}
            <p className="text-[13px] text-muted-foreground">{t('detail.delivery', { delivery: t(`delivery.${order.delivery}`) })}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
