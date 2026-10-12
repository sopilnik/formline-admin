'use client'

import { useEffect, type ReactNode } from 'react'

/**
 * Marks the document `data-hydrated` once the frame has hydrated. React runs a component's effects after its children's,
 * so by then the palette, the shortcuts and the menus inside have attached their keyboard handlers; the end-to-end tests
 * wait for the mark before they press keys or move the focus.
 */
export function FrameReady({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.hydrated = ''
    return () => {
      delete root.dataset.hydrated
    }
  }, [])

  return children
}
