'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useOptimistic, useTransition } from 'react'
import { StatusBadge } from '@/components/orders/status-badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { nextStatuses, type OrderStatus } from '@/lib/orders/status'
import { changeOrderStatusAction } from '@/server/actions/orders'

type Props = { orderId: string; number: number; status: OrderStatus; canUpdate: boolean }

/**
 * The order's status and "Change status": the badge takes the chosen status at
 * once; when the action fails the transition ends on the refreshed page, whose status is the real one.
 */
export function OrderStatusControl({ orderId, number, status, canUpdate }: Props) {
  const t = useTranslations('orders.detail')
  const statusLabel = useTranslations('orders.status')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(status)
  const targets = nextStatuses(shown)
  const change = (to: OrderStatus): void => startTransition(async () => {
    setShown(to)
    const result = await changeOrderStatusAction({ orderId, to })
    if (result.ok) toast.success(t('changed', { number, status: statusLabel(to) }))
    else toast.error(result.code === 'conflict' ? t('conflict') : t('failed'))
  })
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span aria-live="polite"><StatusBadge status={shown} /></span>
      {canUpdate && targets.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" disabled={pending} />}>
            {pending ? t('changing') : t('changeStatus')}
            <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {targets.map(to => <DropdownMenuItem key={to} onClick={() => change(to)}>{statusLabel(to)}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
