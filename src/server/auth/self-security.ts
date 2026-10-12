import 'server-only'
import type { AuthFailure } from '@/lib/auth-form'
import { checkNewPassword } from '@/server/auth/credentials'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { hashPassword } from '@/server/auth/passwords'
import { isRecentAuth } from '@/server/auth/reauth'
import { type Session } from '@/server/auth/sessions'
import { logActivity } from '@/server/dal/activity'
import { deleteOtherOwnSessions, deleteOwnSession } from '@/server/dal/sessions'
import { isUser } from '@/server/dal/users'
import { users } from '@/server/db/schema'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { hashIp } from '@/server/ratelimit/ip'

type Meta = { ip: string | null }

/**
 * A new password for the owner (spec §5.1, §5.2, §8.8): only in the owner workspace — demo members have none —
 * after a recent authentication, under the length and breach rules of setup. Every other session ends.
 */
export async function changeOwnPassword(
  session: Session,
  input: { password: string } & Meta,
  overrides: Partial<AuthDeps> = {},
): Promise<{ ok: true; signedOut: number } | AuthFailure<'password'>> {
  const deps = authDeps(overrides)
  if (session.workspaceKind !== 'owner') return { ok: false, error: 'generic' }
  if (!isRecentAuth(session, deps.now())) return { ok: false, error: 'reauth_required' }
  const refused = await checkNewPassword(input.password, deps)
  if (refused) return refused
  const passwordHash = await hashPassword(input.password)
  const signedOut = await withWorkspace(workspaceContext(session), async tx => {
    await tx.update(users).set({ passwordHash }).where(isUser(session))
    const ended = await deleteOtherOwnSessions(tx, session)
    await logActivity(tx, session.workspaceId, {
      actorUserId: session.userId, action: 'auth.password_changed', entityType: 'user', entityId: session.userId,
      details: { signedOut: ended }, ipHash: hashIp(input.ip, deps.config.ipHashKey),
    })
    return ended
  }, deps.pool)
  return { ok: true, signedOut }
}

/** "Sign out" on one of one's other devices (spec §8.8), logged as `auth.session_revoked`. */
export async function revokeOwnSession(session: Session, id: string, meta: Meta, overrides: Partial<AuthDeps> = {}): Promise<boolean> {
  const deps = authDeps(overrides)
  return withWorkspace(workspaceContext(session), async tx => {
    const ended = await deleteOwnSession(tx, { userId: session.userId, currentId: session.id, id })
    if (!ended) return false
    await logActivity(tx, session.workspaceId, {
      actorUserId: session.userId, action: 'auth.session_revoked', entityType: 'user', entityId: session.userId,
      details: { device: ended.device }, ipHash: hashIp(meta.ip, deps.config.ipHashKey),
    })
    return true
  }, deps.pool)
}

/** "Sign out of all other devices", logged as `auth.other_sessions_revoked` with the count. */
export async function revokeOtherSessions(session: Session, meta: Meta, overrides: Partial<AuthDeps> = {}): Promise<number> {
  const deps = authDeps(overrides)
  return withWorkspace(workspaceContext(session), async tx => {
    const count = await deleteOtherOwnSessions(tx, session)
    if (count > 0) {
      await logActivity(tx, session.workspaceId, {
        actorUserId: session.userId, action: 'auth.other_sessions_revoked', entityType: 'user', entityId: session.userId,
        details: { count }, ipHash: hashIp(meta.ip, deps.config.ipHashKey),
      })
    }
    return count
  }, deps.pool)
}
