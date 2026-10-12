'use server'

import { refresh, revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formText } from '@/lib/auth-form'
import { requireSession } from '@/server/auth/sessions'
import { markAllNotificationsRead, markNotificationRead, notificationHref } from '@/server/dal/notifications'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { readerOf } from '@/server/notifications/feed'

/**
 * Opens a notification (spec §8.9): it is marked read for the member and the page of its subject opens.
 * One the member cannot see leaves them on the notifications page.
 */
export async function openNotificationAction(form: FormData): Promise<void> {
  const session = await requireSession()
  const id = z.uuid().safeParse(formText(form, 'id'))
  if (!id.success) redirect('/notifications')
  const href = await withWorkspace(workspaceContext(session), async tx => {
    const opened = await markNotificationRead(tx, await readerOf(tx, session), id.data)
    return opened ? notificationHref(tx, session.workspaceId, opened.kind, opened.payload) : '/notifications'
  })
  // The page of notifications shows the mark; this also clears the pages the browser keeps for a minute (W.1).
  revalidatePath('/notifications')
  redirect(href)
}

/** "Mark all as read" in the bell and on the page; the page renders again with every mark in place. */
export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await requireSession()
  await withWorkspace(workspaceContext(session), async tx => markAllNotificationsRead(tx, await readerOf(tx, session)))
  refresh()
}
