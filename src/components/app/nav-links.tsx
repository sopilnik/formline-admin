'use client'

import { Activity, Image, Layers, LayoutGrid, Mail, Settings, Shield, ShoppingBag, Users, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { NavItem, NavKey } from '@/components/app/nav'
import { SIDEBAR_LABEL } from '@/components/app/sidebar-label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/intl'
import { cn } from '@/lib/utils'

const ICONS: Record<NavKey, LucideIcon> = {
  overview: LayoutGrid,
  orders: ShoppingBag,
  products: Image,
  collections: Layers,
  customers: Users,
  team: Shield,
  activity: Activity,
  outbox: Mail,
  settings: Settings,
}

// An item's count of the work waiting in its section, and the dot that stands for it in the collapsed menu.
function NavCount({ count, collapsed }: { count: number; collapsed: boolean }) {
  const locale = useLocale()

  return (
    <>
      {/* The space keeps the label and the count apart in the link's visible text, and the count is grouped as the
          link's name groups it: the name must contain the visible text. */}
      {' '}
      <span aria-hidden className={cn('ml-auto text-xs text-sidebar-muted tabular-nums', SIDEBAR_LABEL, collapsed && 'opacity-0')}>
        {formatNumber(count, locale)}
      </span>
      {/* The count's dot appears once the width has settled, and leaves at once when the menu expands. */}
      <span
        aria-hidden
        className={cn('absolute top-1.5 right-1.5 size-2 rounded-full bg-sidebar-bar', collapsed ? 'transition-opacity delay-200 duration-150 ease-out' : 'opacity-0')}
      />
    </>
  )
}

export function NavLinks({ items, collapsed = false, onNavigate }: { items: NavItem[]; collapsed?: boolean; onNavigate?: () => void }) {
  const t = useTranslations('nav')
  const pathname = usePathname()

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, index) => {
        const Icon = ICONS[item.key]
        // An item stands for its whole section: Settings links to /settings/profile and is current on /settings/store too.
        const section = item.href.split('/').slice(0, 2).join('/')
        const current = pathname === section || pathname.startsWith(`${section}/`)
        const link = (
          <Link
            href={item.href}
            aria-current={current ? 'page' : undefined}
            aria-label={item.count ? `${t(item.key)}, ${t('ordersToProcess', { count: item.count })}` : undefined}
            onClick={onNavigate}
            className={cn(
              'relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-strong',
              current && 'bg-sidebar-accent text-sidebar-strong shadow-[inset_3px_0_0_var(--sidebar-bar)]',
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            <span className={cn(SIDEBAR_LABEL, collapsed && 'opacity-0')}>{t(item.key)}</span>
            {item.count ? <NavCount count={item.count} collapsed={collapsed} /> : null}
          </Link>
        )
        const startsGroup = index > 0 && item.group !== items[index - 1]!.group

        return (
          <li key={item.key} className={cn(startsGroup && 'mt-2.5 border-t border-sidebar-border pt-2.5')}>
            {/* Always inside the tooltip, which is off while the labels show: the link stays the same element across
                a collapse, so its label fades instead of being drawn anew. */}
            <Tooltip disabled={!collapsed}>
              <TooltipTrigger render={link} />
              <TooltipContent side="right">{t(item.key)}</TooltipContent>
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}
