import 'server-only'
import { notify, type NotificationKind } from '@/server/dal/notifications'
import type { Self } from '@/server/dal/users'
import type { Tx } from '@/server/db/with-workspace'
import { mail } from '@/server/mail/outbox'
import type { LetterTemplate } from '@/server/mail/transport'

/**
 * A security event the user hears about twice: in the bell and in a letter.
 * The letter greets them by name and is written in their language. A new sign-in also
 * names itself in the bell's copy, so the device that signed in can tell its own entry apart.
 */
export type SecurityNotice = {
  user: Pick<Self, 'id' | 'email' | 'name' | 'locale'>
  kind: NotificationKind & LetterTemplate
  details: Record<string, unknown>
  at: Date
  signInId?: string
}

export async function securityNotice(tx: Tx, workspaceId: string, { user, kind, details, at, signInId }: SecurityNotice): Promise<void> {
  const payload = { ...details, at: at.toISOString() }

  await notify(tx, workspaceId, { userId: user.id, kind, payload: signInId ? { ...payload, signIn: signInId } : payload })
  await mail.send(tx, workspaceId, { to: user.email, template: kind, locale: user.locale, payload: { ...payload, name: user.name } })
}
