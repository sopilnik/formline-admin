'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useOptimistic, useTransition } from 'react'
import { FilterSelect } from '@/components/orders/filter-select'
import { ordersHref, PAGE_SIZES, type OrdersQuery, type PageSize } from '@/lib/orders/query'

export function PageSizeSelect({ query }: { query: OrdersQuery }) {
  const t = useTranslations('orders.pager')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [size, setSize] = useOptimistic(query.size)
  return (
    <FilterSelect
      id="orders-page-size"
      label={t('size')}
      value={String(size)}
      onChange={event => {
        const next = Number(event.target.value) as PageSize
        startTransition(() => {
          setSize(next)
          router.push(ordersHref(query, { size: next }))
        })
      }}
    >
      {PAGE_SIZES.map(option => <option key={option} value={option}>{t('sizeOption', { size: option })}</option>)}
    </FilterSelect>
  )
}
