import 'server-only'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import type { Locale } from '@/i18n/locale'
import type { AssignableRole } from '@/lib/team'
import type { Theme } from '@/lib/theme'
import { type Actor } from '@/server/actor'
import { type NewSession, type Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { logActivity } from '@/server/dal/activity'
import { createInvitation, getPendingInvitation, revokeInvitation, type NewInvitation } from '@/server/dal/invitations'
import { getSelf } from '@/server/dal/users'
import { asDate } from '@/server/db/as-date'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext, type Tx } from '@/server/db/with-workspace'
import { mail } from '@/server/mail/outbox'

/** The letter with the link, in the inviter's language: the visitor who reads it is the one who wrote it. */
async function sendInvitation(tx: Tx, actor: Actor, invitation: { email: string; role: string; token: string }): Promise<void> {
  const inviter = await getSelf(tx, actor)
  if (!inviter) throw new Error(`the inviter ${actor.userId} is not a member of workspace ${actor.workspaceId}`)
  await mail.send(tx, actor.workspaceId, {
    to: invitation.email, template: 'team.invitation', locale: inviter.locale,
    payload: { inviter: inviter.name, role: invitation.role, token: invitation.token },
  })
}

/** "Invite" on the team page: the invitation, its letter and the log entry, in one transaction. */
export async function inviteMember(actor: Actor, input: { email: string; role: AssignableRole; expiresAt: Date }, pool: Pool = getPool()): Promise<NewInvitation> {
  const token = generateToken()
  return withWorkspace(workspaceContext(actor), async tx => {
    const created = await createInvitation(tx, actor.workspaceId, { ...input, invitedBy: actor.userId, token, tokenHash: hashToken(token) })
    if (!created.ok) return created
    await sendInvitation(tx, actor, { email: input.email.toLowerCase(), role: input.role, token })
    await logActivity(tx, actor.workspaceId, {
      actorUserId: actor.userId, action: 'team.invited', entityType: 'invitation', entityId: created.id,
      details: { email: input.email.toLowerCase(), role: input.role }, ipHash: actor.ipHash,
    })
    return created
  }, pool)
}

/** "Resend": the same link in a new letter. */
export async function resendInvitation(actor: Actor, id: string, pool: Pool = getPool()): Promise<{ email: string } | null> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const invitation = await getPendingInvitation(tx, actor.workspaceId, id)
    if (!invitation) return null
    await sendInvitation(tx, actor, invitation)
    await logActivity(tx, actor.workspaceId, {
      actorUserId: actor.userId, action: 'team.invitation_resent', entityType: 'invitation', entityId: id,
      details: { email: invitation.email, role: invitation.role }, ipHash: actor.ipHash,
    })
    return { email: invitation.email }
  }, pool)
}

/** "Revoke": the link stops working. */
export async function revokeMemberInvitation(actor: Actor, id: string, pool: Pool = getPool()): Promise<{ email: string } | null> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const revoked = await revokeInvitation(tx, actor.workspaceId, id)
    if (!revoked) return null
    await logActivity(tx, actor.workspaceId, {
      actorUserId: actor.userId, action: 'team.invitation_revoked', entityType: 'invitation', entityId: id, details: { email: revoked.email }, ipHash: actor.ipHash,
    })
    return revoked
  }, pool)
}

export type Acceptance = ({ ok: true } & NewSession) | { ok: false; reason: 'invalid' | 'taken' }

/**
 * Accepting an invitation from a session in the same sandbox:
 * `accept_invitation` creates the member with the language, the theme and the shortcut switch
 * the visitor has, as "Switch user" hands them over, and replaces the caller's session with
 * theirs, all in one statement.
 */
export async function acceptInvitation(
  session: Session,
  input: { token: string; name: string; userAgentSummary: string | null; ipHash: string | null; preferences: { locale: Locale; theme: Theme } },
  pool: Pool = getPool(),
): Promise<Acceptance> {
  if (session.workspaceKind !== 'sandbox') return { ok: false, reason: 'invalid' }
  const token = generateToken()
  const id = hashToken(token)
  const row = await withWorkspace(workspaceContext(session), async tx => {
    const shortcutsEnabled = (await getSelf(tx, session))?.shortcutsEnabled ?? true
    const { locale, theme } = input.preferences
    const result = await tx.execute<{ outcome: 'accepted' | 'invalid' | 'taken'; sandbox_expires_at: string | null }>(sql`
      select outcome, sandbox_expires_at from fa.accept_invitation(${hashToken(input.token)}, ${input.name}, ${session.id}, ${id},
        ${input.userAgentSummary}, ${input.ipHash}, ${locale}, ${theme}, ${shortcutsEnabled})`)
    return result.rows[0]!
  }, pool)
  if (row.outcome !== 'accepted') return { ok: false, reason: row.outcome }
  if (!row.sandbox_expires_at) throw new Error('accept_invitation accepted without the sandbox\'s expiry')
  return { ok: true, token, id, expiresAt: asDate(row.sandbox_expires_at) }
}
