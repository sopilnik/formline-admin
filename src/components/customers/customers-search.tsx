'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ListSearch } from '@/components/app/list-search'
import { useListQuery } from '@/components/app/use-list-query'
import { customersHref, DEFAULT_CUSTOMERS_QUERY, isCustomersFiltered, type CustomersQuery } from '@/lib/customers/query'

/** The customers list's one filter (spec §8.5): a debounced search by name or email, as on the orders and the products. */
export function CustomersSearch({ query }: { query: CustomersQuery }) {
  const t = useTranslations('customers.search')
  const { go } = useListQuery(query, customersHref)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ListSearch
        id="customers-search"
        action="/customers"
        label={t('label')}
        placeholder={t('placeholder')}
        q={query.q}
        restHref={customersHref(query, { q: '' })}
        onSearch={q => go({ q })}
      />
      {isCustomersFiltered(query) ? (
        <Link
          href={customersHref(DEFAULT_CUSTOMERS_QUERY, { sort: query.sort, dir: query.dir, size: query.size })}
          scroll={false}
          className="ml-1 rounded-sm text-[13px] font-medium text-primary hover:underline"
        >
          {t('clear')}
        </Link>
      ) : null}
    </div>
  )
}
