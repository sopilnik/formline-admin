'use client'

import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Brand } from '@/components/app/brand'
import type { NavItem } from '@/components/app/nav'
import { NavLinks } from '@/components/app/nav-links'
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
    // Always the dark token set, in the light theme too (spec §11).
    <aside
      className={cn(
        'dark sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar px-3.5 py-4.5 text-sidebar-foreground md:flex',
        collapsed ? 'w-[68px]' : 'w-[232px]',
      )}
    >
      <Brand collapsed={collapsed} />
      <nav aria-label={t('label')} className="min-h-0 flex-1 overflow-y-auto">
        <NavLinks items={items} collapsed={collapsed} />
      </nav>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-strong"
      >
        {collapsed ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
        <span className={cn(collapsed && 'sr-only')}>{collapsed ? t('expand') : t('collapse')}</span>
      </button>
    </aside>
  )
}
