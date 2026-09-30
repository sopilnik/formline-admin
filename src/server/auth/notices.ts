import 'server-only'
import { notify, type NotificationKind } from '@/server/dal/notifications'
import type { Self } from '@/server/dal/users'
import type { Tx } from '@/server/db/with-workspace'
import { mail } from '@/server/mail/outbox'
import type { LetterTemplate } from '@/server/mail/transport'

/**
 * A security event the user hears about twice: in the bell and in a letter (spec §8.9, §9).
 * The letter greets them by name and is written in their language. A new sign-in also
 * names itself in the bell's copy, so the device that signed in can tell its own entry apart.
 */
export async function securityNotice(
  tx: Tx,
  workspaceId: string,
  user: Pick<Self, 'id' | 'email' | 'name' | 'locale'>,
  kind: NotificationKind & LetterTemplate,
  details: Record<string, unknown>,
  options: { signInId?: string } = {},
): Promise<void> {
  const payload = { ...details, at: new Date().toISOString() }
  await notify(tx, workspaceId, { userId: user.id, kind, payload: options.signInId ? { ...payload, signIn: options.signInId } : payload })
  await mail.send(tx, workspaceId, { to: user.email, template: kind, locale: user.locale, payload: { ...payload, name: user.name } })
}
