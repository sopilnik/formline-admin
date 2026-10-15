import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/** The direction a list is sorted in. */
export type SortDir = 'asc' | 'desc'

type Props<S extends string> = {
  /** The list's sort now. */
  query: { sort: S; dir: SortDir }
  /** The column's sort. */
  sort: S
  /** The direction the column starts in when it becomes the sort. */
  first: SortDir
  /** The list's URL sorted by a column in a direction. */
  href: (sort: S, dir: SortDir) => string
  label: string
  align?: 'left' | 'right'
}

/** A list's sortable column header: a link to the list sorted by the column, and `aria-sort` on the active one. */
export function SortHeader<S extends string>({ query, sort, first, href, label, align = 'left' }: Props<S>) {
  const active = query.sort === sort
  // A new column starts in its own direction; the active one flips.
  const dir = active ? (query.dir === 'asc' ? 'desc' : 'asc') : first
  const Icon = !active ? ArrowUpDown : query.dir === 'desc' ? ArrowDown : ArrowUp

  return (
    <th
      scope="col"
      aria-sort={active ? (query.dir === 'desc' ? 'descending' : 'ascending') : undefined}
      className={cn('h-10 border-b bg-card px-3 text-left font-medium whitespace-nowrap text-muted-foreground', align === 'right' && 'text-right')}
    >
      <Link
        href={href(sort, dir)}
        scroll={false}
        // A sort draws the list again: the focus finds this header in the new one (FocusKeeper).
        data-focus-key={`sort-${sort}`}
        className={cn('inline-flex items-center gap-1 rounded-sm text-ink-2 hover:text-foreground', active && 'font-semibold text-foreground')}
      >
        {label}
        <Icon aria-hidden className="size-3.5" />
      </Link>
    </th>
  )
}
