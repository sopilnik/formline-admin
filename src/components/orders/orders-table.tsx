'use client'

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { BulkActions } from '@/components/orders/bulk-actions'
import { ORDER_LINK } from '@/components/orders/row-link'
import { SourceLabel } from '@/components/orders/source-label'
import { StatusBadge } from '@/components/orders/status-badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ordersHref, type OrderSort, type OrdersQuery } from '@/lib/orders/query'
import type { OrderRowView } from '@/lib/orders/view'
import { cn } from '@/lib/utils'

const TH = 'h-10 border-b bg-card px-3 text-left font-medium whitespace-nowrap text-muted-foreground'
const TD = 'h-11 border-b px-3 group-last/row:border-b-0'

function SortHeader({ query, sortKey, label, align = 'left' }: { query: OrdersQuery; sortKey: OrderSort; label: string; align?: 'left' | 'right' }) {
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

export function OrdersTable({ rows, query, canUpdate }: { rows: OrderRowView[]; query: OrdersQuery; canUpdate: boolean }) {
  const t = useTranslations('orders')
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const chosen = rows.filter(row => selected.has(row.id))
  const allChosen = rows.length > 0 && chosen.length === rows.length
  const clear = (): void => setSelected(new Set())
  const toggle = (id: string, on: boolean): void => setSelected(current => {
    const next = new Set(current)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })
  const selectAll = (on: boolean): void => setSelected(on ? new Set(rows.map(row => row.id)) : new Set())
  const allBox = (
    <Checkbox
      checked={allChosen}
      indeterminate={chosen.length > 0 && !allChosen}
      onCheckedChange={selectAll}
      aria-label={t('selection.all')}
    />
  )
  const rowBox = (row: OrderRowView) => (
    <Checkbox checked={selected.has(row.id)} onCheckedChange={on => toggle(row.id, on)} aria-label={t('selection.one', { number: row.number })} />
  )

  return (
    <>
      <p aria-live="polite" className="sr-only">{chosen.length > 0 ? t('bulk.selected', { count: chosen.length }) : ''}</p>
      <table aria-label={t('title')} className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] @4xl:table">
        <colgroup>
          <col className="w-10" />
          <col className="w-20" />
          <col className="w-32" />
          <col />
          <col className="w-24" />
          <col className="w-36" />
          <col className="w-20" />
          <col className="w-24" />
        </colgroup>
        <thead className="sticky top-0 z-20">
          {chosen.length > 0 ? (
            // The bulk bar takes the header row's place at the same height (spec §8.2).
            <tr>
              <th scope="col" className={cn(TH, 'w-10 border-border-strong bg-secondary')}>{allBox}</th>
              <th colSpan={7} className={cn(TH, 'border-border-strong bg-secondary font-normal text-foreground')}>
                <BulkActions chosen={chosen} query={query} canUpdate={canUpdate} onClear={clear} />
              </th>
            </tr>
          ) : (
            <tr>
              <th scope="col" className={cn(TH, 'w-10')}>{allBox}</th>
              <SortHeader query={query} sortKey="number" label={t('columns.order')} />
              <SortHeader query={query} sortKey="placed" label={t('columns.placed')} />
              <th scope="col" className={TH}>{t('columns.customer')}</th>
              <th scope="col" className={TH}>{t('columns.source')}</th>
              <th scope="col" className={cn(TH, 'text-center')}>{t('columns.status')}</th>
              <th scope="col" className={cn(TH, 'text-center')}>{t('columns.items')}</th>
              <SortHeader query={query} sortKey="total" label={t('columns.total')} align="right" />
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id} className={cn('group/row relative hover:bg-secondary', selected.has(row.id) && 'bg-row-selected hover:bg-row-selected')}>
              <td className={cn(TD, 'relative z-10 w-10')}>{rowBox(row)}</td>
              <td className={cn(TD, 'tabular-nums')}>
                <Link href={row.href} prefetch={false} className={ORDER_LINK}>#{row.number}</Link>
              </td>
              <td className={cn(TD, 'whitespace-nowrap tabular-nums')}>{row.placed}</td>
              <td className={cn(TD, 'py-1.5')}>
                <span className="block truncate font-medium">{row.customerName}</span>
                <span className="block truncate text-xs text-muted-foreground">{row.customerEmail}</span>
              </td>
              <td className={TD}><SourceLabel source={row.source} /></td>
              <td className={cn(TD, 'text-center')}><StatusBadge status={row.status} /></td>
              <td className={cn(TD, 'text-center tabular-nums')}>{row.items}</td>
              <td className={cn(TD, 'text-right whitespace-nowrap tabular-nums')}>{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="@4xl:hidden">
        <div className="flex items-center gap-3 border-b px-3 py-2.5 text-[13px] text-muted-foreground">
          {allBox}
          <span aria-hidden>{t('selection.allShort')}</span>
        </div>
        <ul aria-label={t('title')} className="flex flex-col">
          {rows.map(row => (
            <li key={row.id} className={cn('group/row relative flex flex-col gap-1 border-b px-3 py-3 last:border-b-0 hover:bg-secondary', selected.has(row.id) && 'bg-row-selected hover:bg-row-selected')}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="relative z-10 flex">{rowBox(row)}</span>
                  <Link href={row.href} prefetch={false} className={cn(ORDER_LINK, 'text-sm tabular-nums')}>#{row.number}</Link>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="min-w-0 pl-7 text-[13px]">
                <span className="block truncate font-medium">{row.customerName}</span>
                <span className="block truncate text-xs text-muted-foreground">{row.customerEmail}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pl-7 text-xs text-muted-foreground tabular-nums">
                <span>{`${row.placed} · ${t('itemsCount', { count: row.items })}`}</span>
                <span className="text-[13px] font-semibold text-foreground">{row.total}</span>
              </div>
              <div className="pl-7"><SourceLabel source={row.source} /></div>
            </li>
          ))}
        </ul>
        {chosen.length > 0 ? (
          <section
            aria-label={t('selection.region')}
            className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-xl rounded-lg border border-border-strong bg-card px-3 py-2 shadow-lg"
          >
            <BulkActions chosen={chosen} query={query} canUpdate={canUpdate} onClear={clear} />
          </section>
        ) : null}
      </div>
    </>
  )
}
