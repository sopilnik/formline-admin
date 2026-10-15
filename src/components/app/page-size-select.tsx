'use client'

import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'
import { FilterSelect } from '@/components/app/filter-select'
import type { PageSize } from '@/lib/pagination'

type Props = {
  id: string
  label: string
  value: PageSize
  /** Each size with its words and the list's link at that size, made on the server. */
  options: { size: PageSize; label: string; href: string }[]
}

export function PageSizeSelect({ id, label, value, options }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [size, setSize] = useOptimistic(value)

  return (
    <FilterSelect
      id={id}
      label={label}
      value={String(size)}
      onChange={event => {
        const next = options.find(option => String(option.size) === event.target.value)

        if (!next) {
          return
        }

        startTransition(() => {
          setSize(next.size)
          router.push(next.href)
        })
      }}
    >
      {options.map(option => <option key={option.size} value={option.size}>{option.label}</option>)}
    </FilterSelect>
  )
}
