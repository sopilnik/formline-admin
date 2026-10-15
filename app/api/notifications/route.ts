import { getLocale } from 'next-intl/server'
import { getSession } from '@/server/auth/sessions'
import { listNotifications } from '@/server/dal/notifications'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { BELL_SIZE, notificationItems, readerOf } from '@/server/notifications/feed'

export const dynamic = 'force-dynamic'

/** What the bell shows: the unread count and the latest notifications. It is read on every navigation, never pushed. */
export async function GET(): Promise<Response> {
  const session = await getSession()

  if (!session?.secondFactorVerified) {
    return new Response(null, { status: 401 })
  }

  const { list, timeZone } = await withWorkspace(workspaceContext(session), async tx => ({
    list: await listNotifications(tx, await readerOf(tx, session), { page: 1, size: BELL_SIZE }),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
  const items = await notificationItems(list.rows, await getLocale(), timeZone)

  return Response.json({ unread: list.unread, total: list.total, items }, { headers: { 'Cache-Control': 'private, no-store' } })
}
