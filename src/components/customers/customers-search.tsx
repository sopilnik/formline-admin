'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef, useState, useTransition, type FormEvent } from 'react'
import { Input } from '@/components/ui/input'
import { customersHref, DEFAULT_CUSTOMERS_QUERY, isCustomersFiltered, type CustomersQuery } from '@/lib/customers/query'

const SEARCH_DELAY_MS = 300

/** The sort and the page size as hidden fields, so the search form also works without scripts. */
function hiddenFields(query: CustomersQuery): [string, string][] {
  const href = customersHref(query, { q: '' })
  const at = href.indexOf('?')
  return at === -1 ? [] : [...new URLSearchParams(href.slice(at + 1))]
}

/** The customers list's one filter (spec §8.5): a debounced search by name or email, as on the orders and the products. */
export function CustomersSearch({ query }: { query: CustomersQuery }) {
  const t = useTranslations('customers.search')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [draft, setDraft] = useState<{ text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const sentQ = useRef(query.q)

  const go = (q: string): void => {
    sentQ.current = q
    startTransition(() => router.push(customersHref(query, { q }), { scroll: false }))
  }

  const search = useEffectEvent((text: string) => go(text.trim()))
  useEffect(() => {
    if (draft === null) return
    const timer = setTimeout(() => search(draft.text), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    // A search changed from outside the field (Back, "Clear search") is written into it; the
    // field's own searches are not, so text typed while a search loads is never overwritten.
    if (query.q !== sentQ.current && input.current) input.current.value = query.q
    sentQ.current = query.q
  }, [query.q])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setDraft(null)
    go((input.current?.value ?? '').trim())
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form role="search" action="/customers" method="get" onSubmit={submit} className="relative w-full md:w-[300px]">
        <label htmlFor="customers-search" className="sr-only">{t('label')}</label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={input}
          id="customers-search"
          name="q"
          type="search"
          autoComplete="off"
          defaultValue={query.q}
          placeholder={t('placeholder')}
          onChange={event => setDraft({ text: event.target.value })}
          className="h-8 bg-card pl-9"
        />
        {hiddenFields(query).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      </form>
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
