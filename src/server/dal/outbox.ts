import 'server-only'
import { and, count, desc, eq } from 'drizzle-orm'
import { pageCount } from '@/lib/pagination'
import { outboxEmails } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type StoredLetter = { id: string; to: string; template: string; payload: unknown; createdAt: Date }

const columns = { id: outboxEmails.id, to: outboxEmails.toAddress, template: outboxEmails.template, payload: outboxEmails.payload, createdAt: outboxEmails.createdAt }

/** One page of the outbox, newest first. Row-level security shows it to owners and admins only. */
export async function listLetters(tx: Tx, workspaceId: string, query: { page: number; size: number }): Promise<{ rows: StoredLetter[]; total: number; pages: number }> {
  const [totalRow] = await tx.select({ n: count() }).from(outboxEmails).where(eq(outboxEmails.workspaceId, workspaceId))
  const rows = await tx.select(columns).from(outboxEmails).where(eq(outboxEmails.workspaceId, workspaceId))
    .orderBy(desc(outboxEmails.createdAt), desc(outboxEmails.id)).limit(query.size).offset((query.page - 1) * query.size)
  const total = totalRow?.n ?? 0

  return { rows, total, pages: pageCount(total, query.size) }
}

export async function getLetter(tx: Tx, workspaceId: string, id: string): Promise<StoredLetter | null> {
  const [row] = await tx.select(columns).from(outboxEmails).where(and(eq(outboxEmails.workspaceId, workspaceId), eq(outboxEmails.id, id)))

  return row ?? null
}
