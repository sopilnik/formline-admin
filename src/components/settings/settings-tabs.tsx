'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/** The sections of Settings as links: each section has its own address, Back works between them. */
export function SettingsTabs({ label, tabs }: { label: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname()

  return (
    <nav aria-label={label} className="-mx-4 -my-1 overflow-x-auto px-4 py-1 md:mx-0 md:my-0 md:overflow-visible md:px-0 md:py-0">
      <ul className="flex min-w-max gap-1 border-b">
        {tabs.map(tab => {
          const current = pathname === tab.href

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-10 items-center border-b-2 border-transparent px-3 text-sm font-medium text-ink-2 hover:text-foreground',
                  current && 'border-primary text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
