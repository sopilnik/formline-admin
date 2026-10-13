'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { FilterSelect } from '@/components/app/filter-select'
import { ListSearch } from '@/components/app/list-search'
import { StatusChips } from '@/components/app/status-chips'
import { useListQuery } from '@/components/app/use-list-query'
import { DEFAULT_PRODUCTS_QUERY, isProductsFiltered, productsHref, STOCK_FILTERS, type ProductsQuery, type StockFilter } from '@/lib/products/query'
import { PRODUCT_STATUSES, type ProductStatus } from '@/lib/products/status'

type Props = { query: ProductsQuery; statusCounts: Record<ProductStatus, number>; collections: { slug: string; name: string }[] }

/** The filters of the products list, built like the orders filters: every change is a navigation. */
export function ProductsFilters({ query, statusCounts, collections }: Props) {
  const t = useTranslations('products.filters')
  const statusLabel = useTranslations('products.status')
  const { view, go } = useListQuery(query, productsHref)

  return (
    <div className="flex flex-col gap-3">
      <StatusChips
        label={t('status')}
        allLabel={t('all')}
        statuses={PRODUCT_STATUSES}
        selected={view.status}
        counts={statusCounts}
        statusLabel={status => statusLabel(status)}
        onChange={status => go({ status })}
      />
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch
          id="products-search"
          action="/products"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          q={query.q}
          restHref={productsHref(query, { q: '' })}
          onSearch={q => go({ q })}
        />
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
