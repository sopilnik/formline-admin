import type { NotificationKind } from '@/server/dal/notifications'
import type { Tx } from '@/server/db/with-workspace'

export type LetterTemplate = NotificationKind
export type Letter = { to: string; template: LetterTemplate; payload: Record<string, unknown> }

/**
 * Where letters go. Version 1 has one transport, the outbox (spec §9): nothing is
 * ever sent anywhere. A real provider would be another implementation, chosen by
 * one environment variable.
 */
export interface MailTransport {
  send(tx: Tx, workspaceId: string, letter: Letter): Promise<void>
}
