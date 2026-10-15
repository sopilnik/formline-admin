'use client'

import { usePathname } from 'next/navigation'
import { createContext, use, useCallback, useEffect, useState, useTransition, type ComponentProps, type ReactNode, type TransitionStartFunction } from 'react'
import { cn } from '@/lib/utils'

const Report = createContext<(path: string, text: string) => void>(() => {})

/**
 * The frame's polite status region for the lists. A search, a filter or a page change draws a new page, whose own count
 * line a screen reader would never hear; this region outlives those navigations, so each new result is said.
 */
export function ListStatusRegion({ children }: { children: ReactNode }) {
  const [said, setSaid] = useState({ path: '', text: '' })
  // A list met on a new page is read with that page: only its later results are said here.
  const report = useCallback((path: string, text: string) => setSaid(current => ({ path, text: current.path === path ? text : '' })), [])

  return (
    <Report value={report}>
      {children}
      <p role="status" data-testid="list-status" className="sr-only">{said.text}</p>
    </Report>
  )
}

/** Hands a list's results ("47 of 705 orders. 1–25 of 47") to the frame's status region. */
export function ListStatus({ text }: { text: string }) {
  const report = use(Report)
  const path = usePathname()

  useEffect(() => report(path, text), [report, path, text])

  return null
}

const Refresh = createContext<{ pending: boolean; start: TransitionStartFunction } | null>(null)

/** One list's controls and its body share one transition, so the body shows while new results load. */
export function ListRefresh({ children }: { children: ReactNode }) {
  const [pending, start] = useTransition()

  return <Refresh value={{ pending, start }}>{children}</Refresh>
}

/** The transition of the list around a control, or the control's own outside one. */
export function useListTransition(): TransitionStartFunction {
  const shared = use(Refresh)
  const [, own] = useTransition()

  return shared?.start ?? own
}

/** A list's body: busy and dimmed while its controls load new results. */
export function ListBody({ className, ...props }: ComponentProps<'section'>) {
  const pending = use(Refresh)?.pending ?? false

  return <section aria-busy={pending || undefined} className={cn(className, pending && 'opacity-60 transition-opacity')} {...props} />
}
