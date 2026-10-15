import 'server-only'
import { and, count, eq, isNotNull, max, sql } from 'drizzle-orm'
import { compareNames } from '@/lib/intl'
import type { AssignableRole } from '@/lib/team'
import { ROLE_ORDER } from '@/server/dal/users'
import { activityLog, passkeys, users } from '@/server/db/schema'
import type { Role, Tx } from '@/server/db/with-workspace'

export type TeamMember = {
  id: string; name: string; email: string; role: Role
  /** An authenticator app, or a passkey the reader can see (their own: row-level security). */
  twoFactor: boolean
  deactivatedAt: Date | null; createdAt: Date
  /** The member's latest entry in the activity log; null before their first. */
  lastActiveAt: Date | null
}

/**
 * Every member of the workspace, the deactivated ones included: active first, the owner
 * first among them, then by role and name. Three one-table queries joined here.
 */
export async function listTeam(tx: Tx, workspaceId: string): Promise<TeamMember[]> {
  const rows = await tx.select({
    id: users.id, name: users.name, email: users.email, role: users.role, totpSecretEnc: users.totpSecretEnc,
    deactivatedAt: users.deactivatedAt, createdAt: users.createdAt,
  }).from(users).where(eq(users.workspaceId, workspaceId))
  const keys = await tx.select({ userId: passkeys.userId, n: count() }).from(passkeys)
    .where(eq(passkeys.workspaceId, workspaceId)).groupBy(passkeys.userId)
  const seen = await tx.select({ userId: activityLog.actorUserId, at: max(activityLog.at) }).from(activityLog)
    .where(and(eq(activityLog.workspaceId, workspaceId), isNotNull(activityLog.actorUserId))).groupBy(activityLog.actorUserId)
  const keysOf = new Map(keys.map(k => [k.userId, k.n]))
  const seenOf = new Map(seen.map(s => [s.userId, s.at]))

  return rows
    .map(({ totpSecretEnc, ...row }) => ({
      ...row,
      twoFactor: totpSecretEnc !== null || (keysOf.get(row.id) ?? 0) > 0,
      lastActiveAt: seenOf.get(row.id) ?? null,
    }))
    .sort((a, b) => Number(a.deactivatedAt !== null) - Number(b.deactivatedAt !== null)
      || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || compareNames(a.name, b.name))
}

export type MemberChange = { ok: true; name: string; from: Role; changed: boolean } | { ok: false; reason: 'not_found' | 'not_allowed' }

type Target = { id: string; name: string; role: Role; deactivatedAt: Date | null }

async function target(tx: Tx, workspaceId: string, userId: string): Promise<Target | null> {
  const [row] = await tx.select({ id: users.id, name: users.name, role: users.role, deactivatedAt: users.deactivatedAt }).from(users)
    .where(and(eq(users.workspaceId, workspaceId), eq(users.id, userId)))

  return row ?? null
}

/**
 * A new role for another active non-owner member. The owner row and one's own row are
 * refused here as the users trigger refuses them in the database.
 */
export async function setMemberRole(
  tx: Tx,
  workspaceId: string,
  { actorId, userId, role }: { actorId: string; userId: string; role: AssignableRole },
): Promise<MemberChange> {
  const member = await target(tx, workspaceId, userId)

  if (!member) return { ok: false, reason: 'not_found' }
  if (member.role === 'owner' || member.id === actorId || member.deactivatedAt !== null) return { ok: false, reason: 'not_allowed' }
  if (member.role === role) return { ok: true, name: member.name, from: member.role, changed: false }

  const updated = await tx.update(users).set({ role }).where(and(eq(users.workspaceId, workspaceId), eq(users.id, userId))).returning({ id: users.id })

  // A role that may not change other members updates nothing under row-level security.
  return updated.length === 1 ? { ok: true, name: member.name, from: member.role, changed: true } : { ok: false, reason: 'not_allowed' }
}

/**
 * Deactivates or reactivates another non-owner member. Deactivating ends every session of theirs at
 * once — the definer trigger `users_revoke_sessions` does it in the same statement.
 */
export async function setMemberActive(
  tx: Tx,
  workspaceId: string,
  { actorId, userId, active }: { actorId: string; userId: string; active: boolean },
): Promise<MemberChange> {
  const member = await target(tx, workspaceId, userId)

  if (!member) return { ok: false, reason: 'not_found' }
  if (member.role === 'owner' || member.id === actorId) return { ok: false, reason: 'not_allowed' }
  if ((member.deactivatedAt === null) === active) return { ok: true, name: member.name, from: member.role, changed: false }

  const updated = await tx.update(users).set({ deactivatedAt: active ? null : sql`now()` })
    .where(and(eq(users.workspaceId, workspaceId), eq(users.id, userId))).returning({ id: users.id })

  return updated.length === 1 ? { ok: true, name: member.name, from: member.role, changed: true } : { ok: false, reason: 'not_allowed' }
}
