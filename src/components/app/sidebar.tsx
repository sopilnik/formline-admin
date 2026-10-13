'use client'

import { ChevronsLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Brand } from '@/components/app/brand'
import type { NavItem } from '@/components/app/nav'
import { NavLinks } from '@/components/app/nav-links'
import { SIDEBAR_LABEL } from '@/components/app/sidebar-label'
import { SIDEBAR_COOKIE } from '@/lib/preferences'
import { cn } from '@/lib/utils'

export function Sidebar({ items, collapsed: initiallyCollapsed }: { items: NavItem[]; collapsed: boolean }) {
  const t = useTranslations('nav')
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    const secure = location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax${secure}`
  }

  return (
    // Always the dark token set, in the light theme too. The width moves in 200 ms; the labels fade inside it.
    <aside
      className={cn(
        'dark sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 overflow-hidden border-r border-sidebar-border bg-sidebar px-3.5 py-4.5 text-sidebar-foreground transition-[width] duration-200 ease-in-out md:flex',
        collapsed ? 'w-[68px]' : 'w-[232px]',
      )}
    >
      <Brand collapsed={collapsed} />
      {/* Never sideways: the faded labels stick out to the right while collapsed, and a wheel would scroll the icons away.
          The 4 px of padding, pulled back by the margin, keep each link's focus ring inside the nav's clip. */}
      <nav aria-label={t('label')} className="-m-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1">
        <NavLinks items={items} collapsed={collapsed} />
      </nav>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-strong"
      >
        <ChevronsLeft className={cn('size-4 shrink-0 transition-transform duration-200 ease-in-out', collapsed && '-scale-x-100')} aria-hidden />
        <span className={cn(SIDEBAR_LABEL, collapsed && 'opacity-0')}>{collapsed ? t('expand') : t('collapse')}</span>
      </button>
    </aside>
  )
}
