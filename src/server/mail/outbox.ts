import 'server-only'
import { outboxEmails } from '@/server/db/schema'
import type { MailTransport } from '@/server/mail/transport'

/** Writes each letter to the workspace's outbox, which the Outbox page shows (spec §9); the language goes into the payload. */
export const outboxTransport: MailTransport = {
  async send(tx, workspaceId, letter) {
    await tx.insert(outboxEmails).values({ workspaceId, toAddress: letter.to, template: letter.template, payload: { ...letter.payload, locale: letter.locale } })
  },
}

export const mail: MailTransport = outboxTransport
