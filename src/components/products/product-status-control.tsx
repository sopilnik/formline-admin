'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useOptimistic, useTransition } from 'react'
import { useReach } from '@/components/app/use-reach'
import { ProductStatusBadge } from '@/components/products/product-status-badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { nextProductStatuses, type ProductStatus } from '@/lib/products/status'
import { changeProductStatusAction } from '@/server/actions/products'

type Props = { productId: string; name: string; status: ProductStatus; canWrite: boolean }

/**
 * The product's status and "Change status", built like the order page's control: the
 * badge takes the chosen status at once; after a failure the refreshed page shows the real one.
 */
export function ProductStatusControl({ productId, name, status, canWrite }: Props) {
  const t = useTranslations('products.statusControl')
  const toast = useToast()
  const send = useReach()
  const [pending, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(status)
  const targets = nextProductStatuses(shown)
  const change = (to: ProductStatus): void => startTransition(async () => {
    setShown(to)
    const result = await send(() => changeProductStatusAction({ productId, to }))
    if (!result) return
    if (result.ok) toast.success(t(`done.${to}`, { name }))
    else toast.error(result.code === 'conflict' ? t('conflict') : t('failed'))
  })
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span aria-live="polite"><ProductStatusBadge status={shown} /></span>
      {canWrite ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" disabled={pending} />}>
            {pending ? t('changing') : t('change')}
            <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {targets.map(to => <DropdownMenuItem key={to} onClick={() => change(to)}>{t(`to.${to}`)}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
