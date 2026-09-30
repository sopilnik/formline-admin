import type { Locale } from '@/i18n/locale'
import type { LetterTemplate } from '@/lib/letters'
import type { Tx } from '@/server/db/with-workspace'

export type { LetterTemplate }

/** A letter as it is written: the recipient's language travels with it (his decision, 29 September). */
export type Letter = { to: string; template: LetterTemplate; locale: Locale; payload: Record<string, unknown> }

/**
 * Where letters go. Version 1 has one transport, the outbox (spec §9): nothing is
 * ever sent anywhere. A real provider would be another implementation, chosen by
 * one environment variable.
 */
export interface MailTransport {
  send(tx: Tx, workspaceId: string, letter: Letter): Promise<void>
}
