'use client'

import { Check, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useOptimistic, useRef, useState, useTransition, type FormEvent } from 'react'
import { FilterSelect } from '@/components/app/filter-select'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DEFAULT_PRODUCTS_QUERY, isProductsFiltered, productsHref, STOCK_FILTERS, type ProductsQuery, type StockFilter } from '@/lib/products/query'
import { PRODUCT_STATUSES, type ProductStatus } from '@/lib/products/status'

const SEARCH_DELAY_MS = 300
const ALL = 'all'

/** "All" is on only while no status is; pressing it clears them, releasing the last status turns it back on. */
function statusesFrom(next: string[], previous: readonly ProductStatus[]): ProductStatus[] {
  if (next.includes(ALL) && previous.length > 0) return []
  return PRODUCT_STATUSES.filter(status => next.includes(status))
}

/** The other filters and the sort as hidden fields, so the search form also works without scripts. */
function hiddenFields(query: ProductsQuery): [string, string][] {
  const href = productsHref(query, { q: '' })
  const at = href.indexOf('?')
  return at === -1 ? [] : [...new URLSearchParams(href.slice(at + 1))]
}

const mergeQuery = (current: ProductsQuery, changes: Partial<ProductsQuery>): ProductsQuery => ({ ...current, ...changes })

type Props = { query: ProductsQuery; statusCounts: Record<ProductStatus, number>; collections: { slug: string; name: string }[] }

/** The filters of the products list (spec §8.3), built like the orders filters: every change is a navigation. */
export function ProductsFilters({ query, statusCounts, collections }: Props) {
  const t = useTranslations('products.filters')
  const statusLabel = useTranslations('products.status')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [view, setView] = useOptimistic(query, mergeQuery)
  const [draft, setDraft] = useState<{ text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const sentQ = useRef(query.q)

  const go = (changes: Partial<ProductsQuery>): void => {
    if (changes.q !== undefined) sentQ.current = changes.q
    startTransition(() => {
      setView(changes)
      router.push(productsHref(view, changes), { scroll: false })
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
        {PRODUCT_STATUSES.map(status => (
          <ToggleGroupItem key={status} value={status} aria-label={`${statusLabel(status)}, ${statusCounts[status]}`} className={chip}>
            <Check aria-hidden className="hidden size-3.5 group-data-pressed/toggle:block" strokeWidth={2.5} />
            {statusLabel(status)}
            <span className={countClass}>{statusCounts[status]}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-center gap-2">
        <form role="search" action="/products" method="get" onSubmit={submit} className="relative w-full md:w-[300px]">
          <label htmlFor="products-search" className="sr-only">{t('searchLabel')}</label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={input}
            id="products-search"
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
          id="products-collection"
          label={t('collection')}
          value={view.collection}
          active={view.collection !== DEFAULT_PRODUCTS_QUERY.collection}
          onChange={event => go({ collection: event.target.value })}
        >
          <option value="">{t('collectionAll')}</option>
          {collections.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </FilterSelect>
        <FilterSelect
          id="products-stock"
          label={t('stock')}
          value={view.stock}
          active={view.stock !== DEFAULT_PRODUCTS_QUERY.stock}
          onChange={event => go({ stock: event.target.value as StockFilter })}
        >
          {STOCK_FILTERS.map(stock => <option key={stock} value={stock}>{t(`stockOptions.${stock}`)}</option>)}
        </FilterSelect>
        {isProductsFiltered(view) ? (
          <Link
            href={productsHref(DEFAULT_PRODUCTS_QUERY, { sort: view.sort, dir: view.dir, size: view.size })}
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
