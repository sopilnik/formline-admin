import 'server-only'
import { and, desc, eq, gt, ne, sql } from 'drizzle-orm'
import { sessions } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type OwnSession = { id: string; createdAt: Date; lastSeenAt: Date; userAgentSummary: string | null }

// Row-level security shows each user only their own sessions (spec §6.2).

/** One's signed-in devices, the most recently active first (spec §8.8): the sessions past their second step. */
export async function listOwnSessions(tx: Tx, userId: string): Promise<OwnSession[]> {
  return tx.select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgentSummary: sessions.userAgentSummary })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.secondFactorVerified, true), gt(sessions.expiresAt, sql`now()`)))
    .orderBy(desc(sessions.lastSeenAt), desc(sessions.createdAt))
}

/** Ends one of one's other sessions; the device it belonged to, or null when there is no such session. */
export async function deleteOwnSession(tx: Tx, input: { userId: string; currentId: string; id: string }): Promise<{ device: string | null } | null> {
  const [row] = await tx.delete(sessions)
    .where(and(eq(sessions.userId, input.userId), eq(sessions.id, input.id), ne(sessions.id, input.currentId)))
    .returning({ device: sessions.userAgentSummary })
  return row ?? null
}

/** Ends every other session of the user; how many there were. */
export async function deleteOtherOwnSessions(tx: Tx, input: { userId: string; currentId: string }): Promise<number> {
  return (await tx.delete(sessions).where(and(eq(sessions.userId, input.userId), ne(sessions.id, input.currentId))).returning({ id: sessions.id })).length
}
