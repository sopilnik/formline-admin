import 'server-only'
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { TEAM_CAP, type AssignableRole } from '@/lib/team'
import { lockCap } from '@/server/dal/concurrency'
import { invitations, users } from '@/server/db/schema'
import type { Role, Tx } from '@/server/db/with-workspace'

export type PendingInvitation = { id: string; email: string; role: Role; createdAt: Date; expiresAt: Date }

/** Neither accepted nor revoked, and not past the sandbox's end. */
const pending = and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, sql`now()`))

/** The open invitations, newest first (spec §8.6). Row-level security shows them to owners and admins. */
export async function listPendingInvitations(tx: Tx, workspaceId: string): Promise<PendingInvitation[]> {
  return tx.select({ id: invitations.id, email: invitations.email, role: invitations.role, createdAt: invitations.createdAt, expiresAt: invitations.expiresAt })
    .from(invitations).where(and(eq(invitations.workspaceId, workspaceId), pending)).orderBy(desc(invitations.createdAt), desc(invitations.id))
}

export type NewInvitation = { ok: true; id: string } | { ok: false; reason: 'member' | 'pending' | 'cap' }

/**
 * An invitation, unless the email already belongs to a member or to an open invitation, or the sandbox
 * holds TEAM_CAP members and open invitations. It lives as long as the sandbox (spec §8.6); the raw token
 * is kept beside its hash because the outbox shows the letter again (spec §6.1).
 */
export async function createInvitation(tx: Tx, workspaceId: string, input: {
  email: string; role: AssignableRole; invitedBy: string; token: string; tokenHash: string; expiresAt: Date
}): Promise<NewInvitation> {
  const email = input.email.toLowerCase()
  const [member] = await tx.select({ id: users.id }).from(users)
    .where(and(eq(users.workspaceId, workspaceId), eq(sql`lower(${users.email})`, email)))
  if (member) return { ok: false, reason: 'member' }
  const [open] = await tx.select({ id: invitations.id }).from(invitations)
    .where(and(eq(invitations.workspaceId, workspaceId), eq(sql`lower(${invitations.email})`, email), pending))
  if (open) return { ok: false, reason: 'pending' }
  await lockCap(tx, workspaceId, 'team')
  const [members] = await tx.select({ n: count() }).from(users).where(eq(users.workspaceId, workspaceId))
  const [invited] = await tx.select({ n: count() }).from(invitations).where(and(eq(invitations.workspaceId, workspaceId), pending))
  if ((members?.n ?? 0) + (invited?.n ?? 0) >= TEAM_CAP) return { ok: false, reason: 'cap' }
  const [row] = await tx.insert(invitations).values({
    workspaceId, email, role: input.role, tokenHash: input.tokenHash, token: input.token, invitedBy: input.invitedBy, expiresAt: input.expiresAt,
  }).returning({ id: invitations.id })
  return { ok: true, id: row!.id }
}

/** An open invitation of the workspace, with what a new letter needs; null for any other. */
export async function getPendingInvitation(tx: Tx, workspaceId: string, id: string): Promise<{ email: string; role: Role; token: string } | null> {
  const [row] = await tx.select({ email: invitations.email, role: invitations.role, token: invitations.token }).from(invitations)
    .where(and(eq(invitations.workspaceId, workspaceId), eq(invitations.id, id), pending))
  return row?.token ? { email: row.email, role: row.role, token: row.token } : null
}

/** Revokes an open invitation; its link stops working. Null when there is none to revoke. */
export async function revokeInvitation(tx: Tx, workspaceId: string, id: string): Promise<{ email: string } | null> {
  const [row] = await tx.update(invitations).set({ revokedAt: sql`now()` })
    .where(and(eq(invitations.workspaceId, workspaceId), eq(invitations.id, id), pending))
    .returning({ email: invitations.email })
  return row ?? null
}

export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired'

/** What the invitation page shows (a definer function: members of every role may read their sandbox's invitation). */
export async function findInvitation(tx: Tx, tokenHash: string): Promise<{ state: InvitationState; email: string; role: Role; inviterName: string | null } | null> {
  const result = await tx.execute<{ state: InvitationState; email: string; role: Role; inviter_name: string | null }>(
    sql`select state, email, role, inviter_name from fa.find_invitation(${tokenHash})`)
  const row = result.rows[0]
  return row ? { state: row.state, email: row.email, role: row.role, inviterName: row.inviter_name } : null
}
