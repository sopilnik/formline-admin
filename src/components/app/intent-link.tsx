'use client'

import Link from 'next/link'
import { useState, type ComponentProps } from 'react'

/**
 * A row's link that prefetches its page once the pointer or the keyboard reaches it, rather than for every row in view
 * (a page of a hundred rows would send a hundred requests). The prefetch brings the page's loading state, so a click
 * shows it at once instead of waiting for the page.
 */
export function IntentLink({ onPointerEnter, onFocus, ...props }: Omit<ComponentProps<typeof Link>, 'prefetch'>) {
  const [wanted, setWanted] = useState(false)
  return (
    <Link
      {...props}
      prefetch={wanted ? null : false}
      onPointerEnter={event => {
        setWanted(true)
        onPointerEnter?.(event)
      }}
      onFocus={event => {
        setWanted(true)
        onFocus?.(event)
      }}
    />
  )
}
