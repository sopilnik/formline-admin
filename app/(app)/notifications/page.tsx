import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Pager } from '@/components/app/pager'
import { NotificationEntry } from '@/components/notifications/notification-entry'
import { Button } from '@/components/ui/button'
import { pageQueryHref, parsePageQuery } from '@/lib/pagination'
import type { SearchParams } from '@/lib/search-params'
import { markAllNotificationsReadAction } from '@/server/actions/notifications'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { listNotifications } from '@/server/dal/notifications'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace } from '@/server/db/with-workspace'
import { notificationItems, readerOf } from '@/server/notifications/feed'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notifications')
  return { title: t('title') }
}

/** Every notification of the member, newest first (spec §8.9); the bell shows the latest few. */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession()
  const query = parsePageQuery(await searchParams)
  const { list, timeZone } = await withWorkspace(workspaceContext(session), async tx => ({
    list: await listNotifications(tx, await readerOf(tx, session), query),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
  if (list.total > 0 && query.page > list.pages) redirect(pageQueryHref('/notifications', query, { page: list.pages }))
  const items = await notificationItems(list.rows, await getLocale(), timeZone)
  const t = await getTranslations('notifications')
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">{t('count', { unread: list.unread, total: list.total })}</p>
        </div>
        {list.unread > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <Button type="submit" variant="outline" size="sm">{t('markAll')}</Button>
          </form>
        ) : null}
      </div>
      <section aria-label={t('title')} className="rounded-lg border bg-card p-2 pb-3">
        {items.length > 0 ? (
          <>
            <ul aria-label={t('title')} className="flex flex-col">
              {items.map(item => (
                <li key={item.id} className="border-b last:border-b-0">
                  <NotificationEntry item={item} />
                </li>
              ))}
            </ul>
            <Pager
              namespace="notifications.pager"
              sizeId="notifications-page-size"
              page={query.page}
              pages={list.pages}
              size={query.size}
              filtered={list.total}
              href={changes => pageQueryHref('/notifications', query, changes)}
            />
          </>
        ) : (
          <p className="px-3 py-8 text-[13px] text-muted-foreground">{t('empty')}</p>
        )}
      </section>
    </div>
  )
}
