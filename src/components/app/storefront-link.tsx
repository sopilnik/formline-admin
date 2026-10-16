'use client'

import { ArrowUpRight, Store } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SIDEBAR_LABEL } from '@/components/app/sidebar-label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STORE_URL } from '@/lib/links'
import { cn } from '@/lib/utils'

/** The way to the store this panel runs, under the menu. It opens a new tab, so the panel stays where it was. */
export function StorefrontLink({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations('nav')
  const common = useTranslations('common')
  const link = (
    <a
      href={STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-strong"
    >
      <Store className="size-[18px] shrink-0" aria-hidden />
      <span className={cn(SIDEBAR_LABEL, collapsed && 'opacity-0')}>{t('storefront')}</span>
      <ArrowUpRight className={cn('size-3.5 shrink-0 text-sidebar-muted', SIDEBAR_LABEL, collapsed && 'opacity-0')} aria-hidden />
      <span className="sr-only">{common('newTab')}</span>
    </a>
  )

  return (
    <Tooltip disabled={!collapsed}>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{t('storefront')}</TooltipContent>
    </Tooltip>
  )
}
