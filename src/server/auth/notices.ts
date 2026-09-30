import 'server-only'
import { notify, type NotificationKind } from '@/server/dal/notifications'
import type { Self } from '@/server/dal/users'
import type { Tx } from '@/server/db/with-workspace'
import { mail } from '@/server/mail/outbox'

/**
 * A security event the user hears about twice: in the bell and in a letter (spec §8.9, §9).
 * The letter greets them by name and is written in their language.
 */
export async function securityNotice(
  tx: Tx,
  workspaceId: string,
  user: Pick<Self, 'id' | 'email' | 'name' | 'locale'>,
  kind: NotificationKind,
  details: Record<string, unknown>,
): Promise<void> {
  const payload = { ...details, at: new Date().toISOString() }
  await notify(tx, workspaceId, { userId: user.id, kind, payload })
  await mail.send(tx, workspaceId, { to: user.email, template: kind, locale: user.locale, payload: { ...payload, name: user.name } })
}
