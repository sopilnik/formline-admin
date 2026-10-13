'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { FilterSelect } from '@/components/app/filter-select'
import { ListSearch } from '@/components/app/list-search'
import { StatusChips } from '@/components/app/status-chips'
import { useListQuery } from '@/components/app/use-list-query'
import { DATE_PRESETS, DEFAULT_ORDERS_QUERY, isOrdersFiltered, ordersHref, SOURCES, type DatePreset, type OrdersQuery, type SourceFilter } from '@/lib/orders/query'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/orders/status'

/** The filters of the orders list. Every change is a navigation: the state lives in the URL. */
export function OrdersFilters({ query, statusCounts }: { query: OrdersQuery; statusCounts: Record<OrderStatus, number> }) {
  const t = useTranslations('orders.filters')
  const statusLabel = useTranslations('orders.status')
  const { view, go } = useListQuery(query, ordersHref)

  return (
    <div className="flex flex-col gap-3">
      <StatusChips
        label={t('status')}
        allLabel={t('all')}
        statuses={ORDER_STATUSES}
        selected={view.status}
        counts={statusCounts}
        statusLabel={status => statusLabel(status)}
        onChange={status => go({ status })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch
          id="orders-search"
          action="/orders"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          q={query.q}
          restHref={ordersHref(query, { q: '' })}
          onSearch={q => go({ q })}
        />
        <FilterSelect
          id="orders-placed"
          label={t('placed')}
          value={view.placed}
          active={view.placed !== DEFAULT_ORDERS_QUERY.placed}
          onChange={event => go({ placed: event.target.value as DatePreset })}
        >
          {DATE_PRESETS.map(preset => <option key={preset} value={preset}>{t(`placedOptions.${preset}`)}</option>)}
        </FilterSelect>
        <FilterSelect
          id="orders-source"
          label={t('source')}
          value={view.source}
          active={view.source !== DEFAULT_ORDERS_QUERY.source}
          onChange={event => go({ source: event.target.value as SourceFilter })}
        >
          {SOURCES.map(source => <option key={source} value={source}>{t(`sourceOptions.${source}`)}</option>)}
        </FilterSelect>
        {isOrdersFiltered(view) ? (
          <Link
            href={ordersHref(DEFAULT_ORDERS_QUERY, { sort: view.sort, dir: view.dir, size: view.size })}
            scroll={false}
            className="ml-1 rounded-sm text-[13px] font-medium text-primary hover:underline"
          >
            {t('clear')}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
