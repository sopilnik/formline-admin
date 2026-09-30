import 'server-only'
import { notifications } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type NotificationKind = 'auth.new_sign_in' | 'auth.second_factor_locked' | 'auth.recovery_code_used' | 'team.invitation_accepted'

/** A notification for one user, or for every member when userId is null (spec §8.9). */
export async function notify(tx: Tx, workspaceId: string, notification: { userId: string | null; kind: NotificationKind; payload: Record<string, unknown> }): Promise<void> {
  await tx.insert(notifications).values({ workspaceId, userId: notification.userId, kind: notification.kind, payload: notification.payload })
}
