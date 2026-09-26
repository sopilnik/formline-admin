import 'server-only'
import { count, eq, sql } from 'drizzle-orm'
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

// Row-level security shows each user only their own passkeys (spec §6.2).

export function listPasskeys(tx: Tx, userId: string): Promise<Passkey[]> {
  return tx.select(columns).from(passkeys).where(eq(passkeys.userId, userId)).orderBy(passkeys.createdAt)
}

export async function findPasskeyByCredential(tx: Tx, credentialId: string): Promise<Passkey | null> {
  const [row] = await tx.select(columns).from(passkeys).where(eq(passkeys.credentialId, credentialId)).limit(1)
  return row ?? null
}

export async function addPasskey(
  tx: Tx,
  workspaceId: string,
  userId: string,
  passkey: { credentialId: string; publicKey: string; counter: number; transports: string[]; name: string },
): Promise<string> {
  const [row] = await tx.insert(passkeys).values({ workspaceId, userId, ...passkey }).returning({ id: passkeys.id })
  return row!.id
}

export async function recordPasskeyUse(tx: Tx, id: string, counter: number): Promise<void> {
  await tx.update(passkeys).set({ counter, lastUsedAt: sql`now()` }).where(eq(passkeys.id, id))
}

export async function renamePasskey(tx: Tx, id: string, name: string): Promise<boolean> {
  return (await tx.update(passkeys).set({ name }).where(eq(passkeys.id, id)).returning({ id: passkeys.id })).length === 1
}

export async function deletePasskey(tx: Tx, id: string): Promise<boolean> {
  return (await tx.delete(passkeys).where(eq(passkeys.id, id)).returning({ id: passkeys.id })).length === 1
}

export async function countPasskeys(tx: Tx, userId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId))
  return row?.n ?? 0
}
