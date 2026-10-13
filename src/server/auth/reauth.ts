import 'server-only'
import type { AuthFailure } from '@/lib/auth-form'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { verifyPassword } from '@/server/auth/passwords'
import { attemptSecondFactor } from '@/server/auth/second-factor'
import { rotateSession, type NewSession, type Session } from '@/server/auth/sessions'
import { passwordLockout, recordPasswordFailure } from '@/server/auth/sign-in'
import { summariseUserAgent } from '@/server/auth/user-agent'
import { logActivity } from '@/server/dal/activity'
import { isUser } from '@/server/dal/users'
import { users } from '@/server/db/schema'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { hashIp } from '@/server/ratelimit/ip'

export const REAUTH_WINDOW_MS = 10 * 60 * 1000

export type ReauthField = 'password' | 'code'

/**
 * Sensitive owner actions need an authentication within the last ten minutes;
 * sandboxes skip it, their demo users have no password.
 */
export function isRecentAuth(session: Pick<Session, 'workspaceKind' | 'reauthAt'>, nowMs: number = Date.now()): boolean {
  if (session.workspaceKind === 'sandbox') return true
  return session.reauthAt !== null && nowMs - session.reauthAt.getTime() < REAUTH_WINDOW_MS
}

/** The password and a second factor again, under the sign-in limits; the session is rotated. */
export async function reauthenticate(
  session: Session,
  input: { password: string; code: string; ip: string | null; userAgent: string | null },
  overrides: Partial<AuthDeps> = {},
): Promise<({ ok: true } & NewSession) | AuthFailure<ReauthField>> {
  const deps = authDeps(overrides)
  const { pool, config } = deps
  const ctx = workspaceContext(session)
  const [self] = await withWorkspace(ctx, tx => tx
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(isUser(session)), pool)
  if (!self?.passwordHash) return { ok: false, error: 'credentials_invalid', field: 'password' }
  const attempt = { email: self.email, ip: input.ip }
  const locked = await passwordLockout(attempt, deps)
  if (locked > 0) return { ok: false, error: 'rate_limited', retryAfterSeconds: locked }
  if (!(await verifyPassword(self.passwordHash, input.password))) {
    await recordPasswordFailure(attempt, deps)
    return { ok: false, error: 'credentials_invalid', field: 'password' }
  }
  const factor = await attemptSecondFactor(session, input, deps)
  if (!factor.ok) return factor
  const ipHash = hashIp(input.ip, config.ipHashKey)
  const fresh = await withWorkspace(ctx, async tx => {
    const rotated = await rotateSession(tx, session, { userAgentSummary: summariseUserAgent(input.userAgent), ipHash })
    await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.reauthenticated', details: { method: 'password' }, ipHash })
    return rotated
  }, pool)
  return { ok: true, ...fresh }
}
