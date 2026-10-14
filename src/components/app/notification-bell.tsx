'use client'

import { Popover } from '@base-ui/react/popover'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState, useTransition } from 'react'
import { useReach } from '@/components/app/use-reach'
import { NotificationEntry } from '@/components/notifications/notification-entry'
import { Button } from '@/components/ui/button'
import type { NotificationItem } from '@/lib/notifications/view'
import { markAllNotificationsReadAction } from '@/server/actions/notifications'

type Feed = { unread: number; total: number; items: NotificationItem[] }

/**
 * The bell in the top bar: the unread count, and the latest notifications in a popover. There is no real
 * time: the bell reads its feed again on every navigation, whenever it opens, and when the server renders the frame
 * with another count (an action that refreshes the page).
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations('notifications')
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(0)
  const [feed, setFeed] = useState<Feed | null>(null)
  const send = useReach()
  const [failed, setFailed] = useState(false)
  const [, startTransition] = useTransition()
  const unread = feed?.unread ?? initialUnread

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/notifications', { signal: controller.signal, cache: 'no-store' })
      .then(response => (response.ok ? (response.json() as Promise<Feed>) : Promise.reject(new Error(String(response.status)))))
      .then(next => {
        setFeed(next)
        setFailed(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [pathname, opened, initialUnread])

  const openChange = (next: boolean) => {
    setOpen(next)
    if (next) setOpened(count => count + 1)
  }

  // The entry's form marks it read on the server and opens its subject; the bell shows the mark at once.
  const markOpened = (id: string) => {
    setOpen(false)
    setFeed(current => {
      if (!current) return current
      const item = current.items.find(i => i.id === id)
      const counted = item && !item.read && !item.thisDevice
      return { ...current, unread: counted ? current.unread - 1 : current.unread, items: current.items.map(i => (i.id === id ? { ...i, read: true } : i)) }
    })
  }

  const markAll = () => {
    const before = feed
    setFeed(current => (current ? { ...current, unread: 0, items: current.items.map(i => ({ ...i, read: true })) } : current))
    startTransition(async () => {
      // No answer: nothing was marked, so the bell shows the entries unread again.
      if ((await send(() => markAllNotificationsReadAction())) === null) setFeed(before)
    })
  }

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <Popover.Trigger render={<Button variant="ghost" size="icon" className="relative" aria-label={t('bell', { count: unread })} />}>
        <Bell aria-hidden />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute top-0 left-[calc(50%+1px)] grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal keepMounted>
        <Popover.Positioner align="end" sideOffset={6} collisionPadding={16} className="isolate z-50 outline-none">
          <Popover.Popup data-slot="notifications-popup" className="flex max-h-(--available-height) w-[min(24rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <Popover.Title className="font-sans text-[15px] font-semibold">{t('title')}</Popover.Title>
              {unread > 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={markAll}>{t('markAll')}</Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {feed ? (
                feed.items.length > 0 ? (
                  <ul aria-label={t('latest')} className="flex flex-col">
                    {feed.items.map(item => (
                      <li key={item.id}>
                        <NotificationEntry item={item} onOpen={markOpened} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-3 py-6 text-[13px] text-muted-foreground">{t('empty')}</p>
                )
              ) : (
                <p role="status" className="px-3 py-6 text-[13px] text-muted-foreground">{failed ? t('failed') : t('loading')}</p>
              )}
            </div>
            <div className="border-t px-4 py-2.5">
              <Link href="/notifications" onClick={() => setOpen(false)} className="text-[13px] font-medium text-primary underline-offset-3 hover:underline">
                {t('all')}
              </Link>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
