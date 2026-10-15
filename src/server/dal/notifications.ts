import 'server-only'
import { and, count, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import { notificationTarget, type NotificationKind } from '@/lib/notifications/view'
import { orderHref } from '@/lib/orders/view'
import { pageCount } from '@/lib/pagination'
import { productHref } from '@/lib/products/view'
import { can, type Action, type WorkspaceKind } from '@/server/authz/matrix'
import { notificationReads, notifications, products } from '@/server/db/schema'
import type { Role, Tx } from '@/server/db/with-workspace'

export type { NotificationKind }

/** A notification for one user, or for every member when userId is null. */
export async function notify(tx: Tx, workspaceId: string, notification: { userId: string | null; kind: NotificationKind; payload: Record<string, unknown> }): Promise<void> {
  await tx.insert(notifications).values({ workspaceId, userId: notification.userId, kind: notification.kind, payload: notification.payload })
}

/** Who reads: the member, and the sign-in of the device they read on. */
export type NotificationReader = { workspaceId: string; userId: string; signInId: string | null }

export type NotificationRow = {
  id: string; kind: string; payload: unknown; createdAt: Date
  read: boolean
  /** The "new sign-in" this very device made: shown as such and never counted as unread. */
  thisDevice: boolean
}

/** The member's own notifications and the ones for everybody; row-level security draws the same line. */
function visible(reader: NotificationReader): SQL {
  return and(eq(notifications.workspaceId, reader.workspaceId), or(isNull(notifications.userId), eq(notifications.userId, reader.userId)))!
}

function ownSignIn(reader: NotificationReader): SQL<boolean> {
  return reader.signInId
    ? sql<boolean>`(${notifications.kind} = 'auth.new_sign_in' and ${notifications.payload}->>'signIn' = ${reader.signInId})`
    : sql<boolean>`false`
}

const readJoin = (reader: NotificationReader) => and(
  eq(notificationReads.workspaceId, notifications.workspaceId),
  eq(notificationReads.notificationId, notifications.id),
  eq(notificationReads.userId, reader.userId),
)!

const unreadSql = (reader: NotificationReader) => sql<boolean>`(${notificationReads.notificationId} is null and not ${ownSignIn(reader)})`

/** The unread ones the bell counts. */
export async function countUnread(tx: Tx, reader: NotificationReader): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(notifications).leftJoin(notificationReads, readJoin(reader))
    .where(and(visible(reader), unreadSql(reader)))

  return row?.n ?? 0
}

/** One page of the member's notifications, newest first, each with its read mark. */
export async function listNotifications(tx: Tx, reader: NotificationReader, query: { page: number; size: number }): Promise<{ rows: NotificationRow[]; total: number; unread: number; pages: number }> {
  const [totals] = await tx.select({ total: count(), unread: sql<number>`count(*) filter (where ${unreadSql(reader)})::int` })
    .from(notifications).leftJoin(notificationReads, readJoin(reader)).where(visible(reader))
  const rows = await tx.select({
    id: notifications.id,
    kind: notifications.kind,
    payload: notifications.payload,
    createdAt: notifications.createdAt,
    read: sql<boolean>`(${notificationReads.notificationId} is not null)`,
    thisDevice: ownSignIn(reader),
  }).from(notifications).leftJoin(notificationReads, readJoin(reader)).where(visible(reader))
    .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(query.size).offset((query.page - 1) * query.size)
  const total = totals?.total ?? 0

  return { rows, total, unread: totals?.unread ?? 0, pages: pageCount(total, query.size) }
}

/**
 * Marks one notification read for the member and returns what it was about; null when the member
 * cannot see it. Marking it twice changes nothing.
 */
export async function markNotificationRead(tx: Tx, reader: NotificationReader, id: string): Promise<{ kind: string; payload: unknown } | null> {
  const [row] = await tx.select({ id: notifications.id, kind: notifications.kind, payload: notifications.payload })
    .from(notifications).where(and(visible(reader), eq(notifications.id, id)))

  if (!row) return null
  await tx.insert(notificationReads).values({ workspaceId: reader.workspaceId, notificationId: row.id, userId: reader.userId }).onConflictDoNothing()

  return { kind: row.kind, payload: row.payload }
}

/** Marks every notification the member can see as read; the number newly marked comes back. */
export async function markAllNotificationsRead(tx: Tx, reader: NotificationReader): Promise<number> {
  const result = await tx.execute(sql`
    insert into fa.notification_reads (workspace_id, notification_id, user_id)
    select ${notifications.workspaceId}, ${notifications.id}, ${reader.userId}::uuid from ${notifications}
     where ${visible(reader)}
    on conflict do nothing`)

  return result.rowCount ?? 0
}

// A page a notification opens that not every role may see: a reader who may not stays on the notifications page.
const PAGE_ACTIONS: Partial<Record<string, Action>> = { '/team': 'team.read' }

/** Who opens a notification: their role decides whether its page answers them. */
export type NotificationOpener = { workspaceId: string; role: Role; workspaceKind: WorkspaceKind }

/** The page a notification opens: its order, its product (by id, whatever its slug is now), or a settings page. */
export async function notificationHref(
  tx: Tx,
  opener: NotificationOpener,
  { kind, payload }: { kind: string; payload: unknown },
): Promise<string> {
  const target = notificationTarget(kind, payload)

  if (!target) return '/notifications'
  if (target.type === 'order') return orderHref(target.number)
  if (target.type === 'page') {
    const action = PAGE_ACTIONS[target.href]

    return action && !can(opener.role, action, opener.workspaceKind) ? '/notifications' : target.href
  }

  const [product] = await tx.select({ slug: products.slug }).from(products)
    .where(and(eq(products.workspaceId, opener.workspaceId), eq(products.id, target.productId)))

  return product ? productHref(product.slug) : '/products'
}
