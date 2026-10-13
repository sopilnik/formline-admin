'use client'

import { Store } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * "Store" with a store icon for an order from the live shop, a muted "Sample" for a
 * generated one. The label sits above the row's stretched link so the
 * tooltip can open; the hint is also in the text for screen readers.
 */
export function SourceLabel({ source }: { source: 'seed' | 'stripe' }) {
  const t = useTranslations('orders.source')
  if (source === 'seed') return <span className="text-xs text-muted-foreground">{t('seed')}</span>
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="relative z-10 inline-flex items-center gap-1.5 text-xs font-medium text-ink-2" />}>
        <Store aria-hidden className="size-3.5" />
        {t('stripe')}
        <span className="sr-only">{`, ${t('storeHint')}`}</span>
      </TooltipTrigger>
      <TooltipContent>{t('storeHint')}</TooltipContent>
    </Tooltip>
  )
}
