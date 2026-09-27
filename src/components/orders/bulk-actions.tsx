'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { sharedTransitions, type OrderStatus } from '@/lib/orders/status'
import type { OrderRowView } from '@/lib/orders/view'
import { changeStatusesAction } from '@/server/actions/orders'

/** The actions on the selected orders (spec §8.2); the table and the phone bar render the same controls. */
export function BulkActions({ chosen, canUpdate, onClear }: { chosen: OrderRowView[]; canUpdate: boolean; onClear: () => void }) {
  const t = useTranslations('orders.bulk')
  const statusLabel = useTranslations('orders.status')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const targets = sharedTransitions(chosen.map(row => row.status))

  const apply = (to: OrderStatus): void => startTransition(async () => {
    const result = await changeStatusesAction({ ids: chosen.map(row => row.id), to })
    if (!result.ok) {
      toast.error(t('failed'))
      return
    }
    const { changed, skipped } = result.data
    const note = skipped.length > 0 ? t('skipped', { count: skipped.length, numbers: skipped.map(n => `#${n}`).join(', ') }) : undefined
    if (changed.length > 0) toast.success(t('changed', { count: changed.length, status: statusLabel(to) }), note)
    else toast.error(t('noneChanged'), note)
    onClear()
  })

  return (
    <div className="flex min-h-7 flex-wrap items-center gap-2.5 text-[13px]">
      <span className="mr-1.5 font-semibold tabular-nums">{t('selected', { count: chosen.length })}</span>
      {canUpdate ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" disabled={pending || targets.length === 0} />}>
            {pending ? t('changing') : t('changeStatus')}
            <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {targets.map(status => (
              <DropdownMenuItem key={status} onClick={() => apply(status)}>{statusLabel(status)}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <button type="button" onClick={onClear} className="ml-auto rounded-sm text-ink-2 underline underline-offset-3 hover:text-foreground">
        {t('clear')}
      </button>
    </div>
  )
}
