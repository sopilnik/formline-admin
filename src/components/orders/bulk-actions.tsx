'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useTransition } from 'react'
import { ExportButton } from '@/components/app/export-button'
import { useReach, useRoleRefusal } from '@/components/app/use-reach'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { EXPORT_CAP } from '@/lib/csv'
import { ordersExportHref, type OrdersQuery } from '@/lib/orders/query'
import { transitionsForAny, type OrderStatus } from '@/lib/orders/status'
import type { OrderRowView } from '@/lib/orders/view'
import { changeStatusesAction } from '@/server/actions/orders'

type Props = { chosen: OrderRowView[]; query: OrdersQuery; canUpdate: boolean; onClear: () => void }

/** The actions on the selected orders; the table and the phone bar render the same controls. */
export function BulkActions({ chosen, query, canUpdate, onClear }: Props) {
  const t = useTranslations('orders.bulk')
  const statusLabel = useTranslations('orders.status')
  const toast = useToast()
  const send = useReach()
  const refused = useRoleRefusal()
  const orders = useTranslations('orders')
  const [pending, startTransition] = useTransition()
  const targets = transitionsForAny(chosen.map(row => row.status))
  const hint = useId()

  const apply = (to: OrderStatus): void => startTransition(async () => {
    const result = await send(() => changeStatusesAction({ ids: chosen.map(row => row.id), to }))

    if (!result) return
    if (!result.ok) {
      if (result.code === 'forbidden') refused(orders('forbidden'))
      else toast.error(t('failed'))

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
          <DropdownMenuTrigger
            render={(
              <Button
                type="button" variant="outline" size="sm" disabled={pending || targets.length === 0} data-focus-key="orders-selection"
                aria-describedby={targets.length === 0 ? hint : undefined}
              />
            )}
          >
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
      {canUpdate && targets.length === 0 ? <span id={hint} className="text-xs text-muted-foreground">{t('noTransitions')}</span> : null}
      <ExportButton namespace="orders.export" cap={EXPORT_CAP} href={ordersExportHref(query, chosen.map(row => row.id))} label={t('exportSelected')} size="sm" />
      <button type="button" onClick={onClear} data-focus-key="orders-selection" className="ml-auto rounded-sm text-ink-2 underline underline-offset-3 hover:text-foreground">
        {t('clear')}
      </button>
    </div>
  )
}
