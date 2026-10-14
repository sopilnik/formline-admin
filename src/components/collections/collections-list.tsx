'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import { ROW_LINK } from '@/components/app/row-link'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { collectionHref } from '@/lib/collections/view'
import { cn } from '@/lib/utils'
import { moveCollectionAction } from '@/server/actions/collections'

type CollectionItem = { id: string; slug: string; name: string; description: string; products: number }
type Direction = 'up' | 'down'

function moved(rows: CollectionItem[], move: { id: string; direction: Direction }): CollectionItem[] {
  const index = rows.findIndex(row => row.id === move.id)
  const target = move.direction === 'up' ? index - 1 : index + 1
  if (index === -1 || target < 0 || target >= rows.length) return rows
  const next = [...rows]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return next
}

/**
 * The collections in their order with "Move up" and "Move down" for a role that may
 * change them. The row moves at once; focus stays on the button that moved it, or on its
 * neighbour when that one is now disabled, and the new place is announced.
 */
export function CollectionsList({ rows, canWrite }: { rows: CollectionItem[]; canWrite: boolean }) {
  const t = useTranslations('collections')
  const toast = useToast()
  const [, startTransition] = useTransition()
  const [order, move] = useOptimistic(rows, moved)
  const [announcement, setAnnouncement] = useState('')
  const [focus, setFocus] = useState<{ id: string; direction: Direction } | null>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!focus) return
    const button = (direction: Direction) => list.current?.querySelector<HTMLButtonElement>(`[data-move="${focus.id}:${direction}"]`)
    const wanted = button(focus.direction)
    // A move button at the end of the list is disabled but keeps the focus (ui/button.tsx): the other one takes it over.
    const target = wanted && wanted.getAttribute('aria-disabled') !== 'true' ? wanted : button(focus.direction === 'up' ? 'down' : 'up')
    target?.focus()
  }, [focus, order])

  const run = (row: CollectionItem, direction: Direction): void => {
    setFocus({ id: row.id, direction })
    startTransition(async () => {
      move({ id: row.id, direction })
      const result = await moveCollectionAction({ id: row.id, direction })
      if (result.ok) setAnnouncement(t('moved', { name: row.name, position: result.data.position, count: result.data.of }))
      else toast.error(t('moveFailed'))
    })
  }

  return (
    <>
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <ul ref={list} aria-label={t('title')} className="flex flex-col">
        {order.map((row, index) => (
          <li key={row.id} className="group/row relative flex items-center gap-3 border-b px-3 py-3 last:border-b-0 hover:bg-secondary">
            <span className="w-6 shrink-0 text-right text-[13px] text-muted-foreground tabular-nums">{index + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Link
                href={collectionHref(row.slug)}
                prefetch={false}
                className={cn(ROW_LINK, 'w-fit max-w-full font-medium wrap-anywhere')}
              >
                {row.name}
              </Link>
              {row.description ? <span className="truncate text-xs text-muted-foreground">{row.description}</span> : null}
              <span className="text-xs text-muted-foreground tabular-nums sm:hidden">{t('products', { count: row.products })}</span>
            </div>
            <span className="hidden shrink-0 text-[13px] text-muted-foreground tabular-nums sm:inline">{t('products', { count: row.products })}</span>
            {canWrite ? (
              <span className="relative z-10 flex shrink-0 gap-1">
                <Button
                  type="button" variant="ghost" size="icon-sm" data-move={`${row.id}:up`} disabled={index === 0}
                  aria-label={t('moveUp', { name: row.name })} onClick={() => run(row, 'up')}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button" variant="ghost" size="icon-sm" data-move={`${row.id}:down`} disabled={index === order.length - 1}
                  aria-label={t('moveDown', { name: row.name })} onClick={() => run(row, 'down')}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}
