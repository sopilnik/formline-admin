import { useRouter } from 'next/navigation'
import { useOptimistic, useTransition } from 'react'

/**
 * A list's filters as its URL holds them: `view` shows a change at once, `go` navigates to it. Every change of a filter is
 * a navigation, so the state survives a reload and Back.
 */
export function useListQuery<Q extends object>(query: Q, href: (query: Q, changes: Partial<Q>) => string): { view: Q; go: (changes: Partial<Q>) => void } {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [view, setView] = useOptimistic(query, (current: Q, changes: Partial<Q>): Q => ({ ...current, ...changes }))

  const go = (changes: Partial<Q>): void => startTransition(() => {
    setView(changes)
    router.push(href(view, changes), { scroll: false })
  })

  return { view, go }
}
