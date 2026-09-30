import 'server-only'
import { getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/locale'
import { formatDateTime } from '@/lib/intl'
import { notificationMessage } from '@/lib/notifications/message'
import { notificationView, type NotificationItem } from '@/lib/notifications/view'
import type { Session } from '@/server/auth/sessions'
import type { NotificationReader, NotificationRow } from '@/server/dal/notifications'
import { sessionSignInId } from '@/server/dal/sessions'
import type { Role, Tx } from '@/server/db/with-workspace'

/** The bell shows this many; the page has the rest. */
export const BELL_SIZE = 6

/** The reader of a request: the member, and the sign-in of the device the request comes from. */
export async function readerOf(tx: Tx, session: Pick<Session, 'workspaceId' | 'userId' | 'id'>): Promise<NotificationReader> {
  return { workspaceId: session.workspaceId, userId: session.userId, signInId: await sessionSignInId(tx, session.id) }
}

const ROLES: readonly string[] = ['owner', 'admin', 'manager', 'viewer'] satisfies Role[]

export async function notificationItems(rows: NotificationRow[], locale: Locale, timeZone: string): Promise<NotificationItem[]> {
  const t = await getTranslations({ locale, namespace: 'notifications.kinds' })
  const roles = await getTranslations({ locale, namespace: 'user.roles' })
  const roleName = (role: string): string => (ROLES.includes(role) ? roles(role as Role) : role)
  return rows.flatMap(row => {
    const view = notificationView(row.kind, row.payload)
    if (!view) return []
    const message = notificationMessage(view, locale, roleName)
    return [{
      id: row.id,
      kind: view.kind,
      title: t(message.title.key, message.title.values),
      detail: t(message.detail.key, message.detail.values),
      time: formatDateTime(row.createdAt, locale, timeZone),
      read: row.read,
      thisDevice: row.thisDevice,
    }]
  })
}
