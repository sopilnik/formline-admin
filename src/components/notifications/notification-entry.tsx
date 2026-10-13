'use client'

import { KeyRound, Lock, LogIn, PackageMinus, ShoppingBag, UserPlus, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { NotificationItem, NotificationKind } from '@/lib/notifications/view'
import { cn } from '@/lib/utils'
import { openNotificationAction } from '@/server/actions/notifications'

const ICONS: Record<NotificationKind, LucideIcon> = {
  'order.created': ShoppingBag,
  'stock.low': PackageMinus,
  'team.invitation_accepted': UserPlus,
  'auth.new_sign_in': LogIn,
  'auth.second_factor_locked': Lock,
  'auth.recovery_code_used': KeyRound,
}

/**
 * One notification in the bell or on the page: pressing it marks it read and opens its subject.
 * It is a form, so the page works before its scripts load too.
 */
export function NotificationEntry({ item, onOpen }: { item: NotificationItem; onOpen?: (id: string) => void }) {
  const t = useTranslations('notifications')
  const Icon = ICONS[item.kind]
  const unread = !item.read && !item.thisDevice
  return (
    <form action={openNotificationAction} onSubmit={() => onOpen?.(item.id)}>
      <input type="hidden" name="id" value={item.id} />
      <button
        type="submit"
        className="flex w-full gap-3 rounded-md px-3 py-2.5 text-left outline-none hover:bg-secondary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      >
        <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-ink-2">
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn('text-sm wrap-anywhere', unread && 'font-semibold')}>{item.title}</span>
          <span className="text-[13px] wrap-anywhere text-muted-foreground">{item.detail}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
            <span>{item.time}</span>
            {item.thisDevice ? <span className="rounded-sm border border-border-strong px-1.5 text-ink-2">{t('thisDevice')}</span> : null}
          </span>
        </span>
        {unread ? (
          <span className="relative mt-2 size-2 shrink-0 rounded-full bg-primary">
            <span className="sr-only">{t('unread')}</span>
          </span>
        ) : null}
      </button>
    </form>
  )
}
