import 'server-only'
import { and, count, eq, sql } from 'drizzle-orm'
import type { Who } from '@/server/dal/users'
import { passkeys } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type Passkey = {
  id: string
  userId: string
  credentialId: string
  publicKey: string
  counter: number
  transports: string[]
  name: string
  createdAt: Date
  lastUsedAt: Date | null
}

const columns = {
  id: passkeys.id,
  userId: passkeys.userId,
  credentialId: passkeys.credentialId,
  publicKey: passkeys.publicKey,
  counter: passkeys.counter,
  transports: passkeys.transports,
  name: passkeys.name,
  createdAt: passkeys.createdAt,
  lastUsedAt: passkeys.lastUsedAt,
}

// Row-level security shows each user only their own passkeys; every query names the workspace and the user as
// well, as the rest of the data access layer does.
const own = (who: Who) => and(eq(passkeys.workspaceId, who.workspaceId), eq(passkeys.userId, who.userId))

export function listPasskeys(tx: Tx, who: Who): Promise<Passkey[]> {
  return tx.select(columns).from(passkeys).where(own(who)).orderBy(passkeys.createdAt)
}

/** The passkey a sign-in names, before anyone is signed in: the workspace and the credential find it. */
export async function findPasskeyByCredential(tx: Tx, workspaceId: string, credentialId: string): Promise<Passkey | null> {
  const [row] = await tx.select(columns).from(passkeys).where(and(eq(passkeys.workspaceId, workspaceId), eq(passkeys.credentialId, credentialId))).limit(1)

  return row ?? null
}

export async function addPasskey(
  tx: Tx,
  { workspaceId, userId }: Who,
  passkey: { credentialId: string; publicKey: string; counter: number; transports: string[]; name: string },
): Promise<string> {
  const [row] = await tx.insert(passkeys).values({ workspaceId, userId, ...passkey }).returning({ id: passkeys.id })

  return row!.id
}

export async function recordPasskeyUse(tx: Tx, who: Who, { id, counter }: { id: string; counter: number }): Promise<void> {
  await tx.update(passkeys).set({ counter, lastUsedAt: sql`now()` }).where(and(own(who), eq(passkeys.id, id)))
}

export async function renamePasskey(tx: Tx, who: Who, { id, name }: { id: string; name: string }): Promise<boolean> {
  return (await tx.update(passkeys).set({ name }).where(and(own(who), eq(passkeys.id, id))).returning({ id: passkeys.id })).length === 1
}

export async function deletePasskey(tx: Tx, who: Who, id: string): Promise<boolean> {
  return (await tx.delete(passkeys).where(and(own(who), eq(passkeys.id, id))).returning({ id: passkeys.id })).length === 1
}

export async function countPasskeys(tx: Tx, who: Who): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(passkeys).where(own(who))

  return row?.n ?? 0
}
