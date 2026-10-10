'use client'

import { Check, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useOptimistic, useRef, useState, useTransition, type FormEvent } from 'react'
import { FilterSelect } from '@/components/app/filter-select'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DATE_PRESETS, DEFAULT_QUERY, isFiltered, ordersHref, SOURCES, type DatePreset, type OrdersQuery, type SourceFilter } from '@/lib/orders/query'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/orders/status'

const SEARCH_DELAY_MS = 300
const ALL = 'all'

/** "All" is on only while no status is; pressing it clears them, releasing the last status turns it back on. */
function statusesFrom(next: string[], previous: readonly OrderStatus[]): OrderStatus[] {
  if (next.includes(ALL) && previous.length > 0) return []
  return ORDER_STATUSES.filter(status => next.includes(status))
}

/** The other filters and the sort as hidden fields, so the search form also works without scripts. */
function hiddenFields(query: OrdersQuery): [string, string][] {
  const href = ordersHref(query, { q: '', page: 1 })
  const at = href.indexOf('?')
  return at === -1 ? [] : [...new URLSearchParams(href.slice(at + 1))]
}

const mergeQuery = (current: OrdersQuery, changes: Partial<OrdersQuery>): OrdersQuery => ({ ...current, ...changes })

/** The filters of the orders list (spec §8.2). Every change is a navigation: the state lives in the URL. */
export function OrdersFilters({ query, statusCounts }: { query: OrdersQuery; statusCounts: Record<OrderStatus, number> }) {
  const t = useTranslations('orders.filters')
  const statusLabel = useTranslations('orders.status')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [view, setView] = useOptimistic(query, mergeQuery)
  const [draft, setDraft] = useState<{ text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const sentQ = useRef(query.q)

  const go = (changes: Partial<OrdersQuery>): void => {
    if (changes.q !== undefined) sentQ.current = changes.q
    startTransition(() => {
      setView(changes)
      router.push(ordersHref(view, changes), { scroll: false })
    })
  }

  const search = useEffectEvent((text: string) => go({ q: text.trim() }))
  useEffect(() => {
    if (draft === null) return
    const timer = setTimeout(() => search(draft.text), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    // A search changed from outside the field (Back, "Clear filters") is written into it; the
    // field's own searches are not, so text typed while a search loads is never overwritten.
    if (query.q !== sentQ.current && input.current) input.current.value = query.q
    sentQ.current = query.q
  }, [query.q])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setDraft(null)
    go({ q: (input.current?.value ?? '').trim() })
  }

  const all = Object.values(statusCounts).reduce((sum, n) => sum + n, 0)
  const chip = 'h-8 shrink-0 gap-1.5 rounded-full border border-input bg-card px-3 text-[13px] font-normal text-ink-2 data-pressed:border-selected'
  const countClass = 'text-xs text-muted-foreground tabular-nums group-data-pressed/toggle:text-selected-foreground'
  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup
        multiple
        aria-label={t('status')}
        value={view.status.length > 0 ? view.status : [ALL]}
        onValueChange={next => go({ status: statusesFrom(next, view.status) })}
        className="-mx-4 w-auto flex-nowrap overflow-x-auto px-4 -mt-1 pt-1 pb-1 md:mx-0 md:mt-0 md:flex-wrap md:overflow-visible md:px-0 md:pt-0 md:pb-0"
      >
        <ToggleGroupItem value={ALL} aria-label={`${t('all')}, ${all}`} className={chip}>
          <Check aria-hidden className="hidden size-3.5 group-data-pressed/toggle:block" strokeWidth={2.5} />
          {t('all')}
          <span className={countClass}>{all}</span>
        </ToggleGroupItem>
        {ORDER_STATUSES.map(status => (
          <ToggleGroupItem key={status} value={status} aria-label={`${statusLabel(status)}, ${statusCounts[status]}`} className={chip}>
            <Check aria-hidden className="hidden size-3.5 group-data-pressed/toggle:block" strokeWidth={2.5} />
            {statusLabel(status)}
            <span className={countClass}>{statusCounts[status]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-center gap-2">
        <form role="search" action="/orders" method="get" onSubmit={submit} className="relative w-full md:w-[300px]">
          <label htmlFor="orders-search" className="sr-only">{t('searchLabel')}</label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={input}
            id="orders-search"
            name="q"
            type="search"
            autoComplete="off"
            defaultValue={query.q}
            placeholder={t('searchPlaceholder')}
            onChange={event => setDraft({ text: event.target.value })}
            className="h-8 bg-card pl-9"
          />
          {hiddenFields(query).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        </form>
        <FilterSelect
          id="orders-placed"
          label={t('placed')}
          value={view.placed}
          active={view.placed !== DEFAULT_QUERY.placed}
          onChange={event => go({ placed: event.target.value as DatePreset })}
        >
          {DATE_PRESETS.map(preset => <option key={preset} value={preset}>{t(`placedOptions.${preset}`)}</option>)}
        </FilterSelect>
        <FilterSelect
          id="orders-source"
          label={t('source')}
          value={view.source}
          active={view.source !== DEFAULT_QUERY.source}
          onChange={event => go({ source: event.target.value as SourceFilter })}
        >
          {SOURCES.map(source => <option key={source} value={source}>{t(`sourceOptions.${source}`)}</option>)}
        </FilterSelect>
        {isFiltered(view) ? (
          <Link
            href={ordersHref(DEFAULT_QUERY, { sort: view.sort, dir: view.dir, size: view.size })}
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
