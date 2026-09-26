import 'server-only'
import { notify, type NotificationKind } from '@/server/dal/notifications'
import type { Tx } from '@/server/db/with-workspace'
import { mail } from '@/server/mail/outbox'

/** A security event the user hears about twice: in the bell and in a letter (spec §8.9, §9). */
export async function securityNotice(
  tx: Tx,
  workspaceId: string,
  user: { id: string; email: string },
  kind: NotificationKind,
  details: Record<string, unknown>,
): Promise<void> {
  const payload = { ...details, at: new Date().toISOString() }
  await notify(tx, workspaceId, { userId: user.id, kind, payload })
  await mail.send(tx, workspaceId, { to: user.email, template: kind, payload })
}
