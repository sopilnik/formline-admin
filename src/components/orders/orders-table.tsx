'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { SourceLabel } from '@/components/orders/source-label'
import { StatusBadge } from '@/components/orders/status-badge'
import { ordersHref, type OrdersQuery, type SortKey } from '@/lib/orders/query'
import type { OrderRowView } from '@/lib/orders/view'
import { cn } from '@/lib/utils'

// The number is a real link stretched over its row or card (spec §8.2): underlined on hover and focus, no click handler on the row.
const ORDER_LINK = 'font-semibold underline decoration-border-strong underline-offset-3 group-hover/row:decoration-current focus-visible:decoration-current after:absolute after:inset-0'
const TH = 'h-10 border-b bg-card px-3 text-left font-medium whitespace-nowrap text-muted-foreground'
const TD = 'h-11 border-b px-3 group-last/row:border-b-0'

function SortHeader({ query, sortKey, label, align = 'left' }: { query: OrdersQuery; sortKey: SortKey; label: string; align?: 'left' | 'right' }) {
  const active = query.sort === sortKey
  // A new column starts newest / largest first; the active one flips its direction.
  const dir = active && query.dir === 'desc' ? 'asc' : 'desc'
  const Icon = !active ? ArrowUpDown : query.dir === 'desc' ? ArrowDown : ArrowUp
  return (
    <th scope="col" aria-sort={active ? (query.dir === 'desc' ? 'descending' : 'ascending') : undefined} className={cn(TH, align === 'right' && 'text-right')}>
      <Link
        href={ordersHref(query, { sort: sortKey, dir })}
        scroll={false}
        className={cn('inline-flex items-center gap-1 rounded-sm text-ink-2 hover:text-foreground', active && 'font-semibold text-foreground')}
      >
        {label}
        <Icon aria-hidden className="size-3.5" />
      </Link>
    </th>
  )
}

export function OrdersTable({ rows, query }: { rows: OrderRowView[]; query: OrdersQuery }) {
  const t = useTranslations('orders')
  return (
    <>
      <table aria-label={t('title')} className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] @4xl:table">
        <colgroup>
          <col className="w-20" />
          <col className="w-32" />
          <col />
          <col className="w-20" />
          <col className="w-24" />
          <col className="w-36" />
          <col className="w-24" />
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <SortHeader query={query} sortKey="number" label={t('columns.order')} />
            <SortHeader query={query} sortKey="placed" label={t('columns.placed')} />
            <th scope="col" className={TH}>{t('columns.customer')}</th>
            <th scope="col" className={cn(TH, 'text-right')}>{t('columns.items')}</th>
            <SortHeader query={query} sortKey="total" label={t('columns.total')} align="right" />
            <th scope="col" className={TH}>{t('columns.status')}</th>
            <th scope="col" className={TH}>{t('columns.source')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className="group/row relative hover:bg-secondary">
              <td className={cn(TD, 'tabular-nums')}>
                <Link href={row.href} prefetch={false} className={ORDER_LINK}>#{row.number}</Link>
              </td>
              <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{row.placed}</td>
              <td className={cn(TD, 'py-1.5')}>
                <span className="block truncate font-medium">{row.customerName}</span>
                <span className="block truncate text-xs text-muted-foreground">{row.customerEmail}</span>
              </td>
              <td className={cn(TD, 'text-right tabular-nums')}>{row.items}</td>
              <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>{row.total}</td>
              <td className={TD}><StatusBadge status={row.status} /></td>
              <td className={TD}><SourceLabel source={row.source} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={t('title')} className="flex flex-col @4xl:hidden">
        {rows.map(row => (
          <li key={row.id} className="group/row relative flex flex-col gap-1 border-b px-3 py-3 last:border-b-0 hover:bg-secondary">
            <div className="flex items-center justify-between gap-3">
              <Link href={row.href} prefetch={false} className={cn(ORDER_LINK, 'text-sm tabular-nums')}>#{row.number}</Link>
              <StatusBadge status={row.status} />
            </div>
            <div className="min-w-0 text-[13px]">
              <span className="block truncate font-medium">{row.customerName}</span>
              <span className="block truncate text-xs text-muted-foreground">{row.customerEmail}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground tabular-nums">
              <span>{`${row.placed} · ${t('itemsCount', { count: row.items })}`}</span>
              <span className="text-[13px] font-semibold text-foreground">{row.total}</span>
            </div>
            <SourceLabel source={row.source} />
          </li>
        ))}
      </ul>
    </>
  )
}
