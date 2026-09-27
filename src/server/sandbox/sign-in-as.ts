import 'server-only'
import { sql } from 'drizzle-orm'
import type { AuthFailure } from '@/lib/auth-form'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { workspaceContext, type NewSession, type Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { decryptTotpSecret, verifyTotp } from '@/server/auth/totp'
import { getMemberFactor } from '@/server/dal/users'
import { withWorkspace } from '@/server/db/with-workspace'
import { consume, lockRemaining, setLock } from '@/server/ratelimit/consume'
import { userSubject } from '@/server/ratelimit/ip'
import { LIMITS, LOCKS, SECOND_FACTOR_LOCK_SECONDS } from '@/server/ratelimit/limits'

export type SwitchInput = { targetUserId: string; code: string; userAgentSummary: string | null; ipHash: string | null }

/**
 * "Switch user" in a sandbox (spec §6.4): a verified session of another demo user
 * replaces the current one. A target with an enrolled authenticator asks for its
 * code first, under the same per-account limit and lock as sign-in (spec §5.4).
 */
export async function switchUser(session: Session, input: SwitchInput, overrides: Partial<AuthDeps> = {}): Promise<({ ok: true } & NewSession) | AuthFailure<'code'>> {
  const deps = authDeps(overrides)
  if (session.workspaceKind !== 'sandbox') return { ok: false, error: 'generic' }
  const ctx = workspaceContext(session)
  const target = await withWorkspace(ctx, tx => getMemberFactor(tx, input.targetUserId), deps.pool)
  if (!target || target.deactivatedAt || target.id === session.userId) return { ok: false, error: 'generic' }
  let step: number | null = null
  if (target.totpSecretEnc) {
    const subject = userSubject(target.id)
    const locked = await lockRemaining(LOCKS.secondFactor, subject, SECOND_FACTOR_LOCK_SECONDS, deps.pool)
    if (locked > 0) return { ok: false, error: 'second_factor_locked', field: 'code', retryAfterSeconds: locked }
    const secret = decryptTotpSecret(target.totpSecretEnc, { workspaceId: session.workspaceId, userId: target.id }, deps.config.totpKeys)
    const verdict = verifyTotp(secret, input.code, target.totpLastStep, deps.now())
    if (!verdict.ok) {
      const failures = await consume(LIMITS.secondFactorFail, subject, deps.pool)
      if (!failures.allowed) {
        await setLock(LOCKS.secondFactor, subject, deps.pool)
        return { ok: false, error: 'second_factor_locked', field: 'code', retryAfterSeconds: SECOND_FACTOR_LOCK_SECONDS }
      }
      return { ok: false, error: 'code_invalid', field: 'code' }
    }
    step = verdict.step
  }
  const token = generateToken()
  const id = hashToken(token)
  const result = await withWorkspace(ctx, tx => tx.execute<{ expires_at: string }>(
    sql`select fa.sandbox_sign_in_as(${target.id}, ${session.id}, ${id}, ${step}, ${input.userAgentSummary}, ${input.ipHash}) as expires_at`), deps.pool)
  // A raw statement through the workspace transaction returns a timestamptz column as
  // text rather than a Date, unlike a plain pool query; coerce it before it reaches the cookie.
  return { ok: true, token, id, expiresAt: new Date(result.rows[0]!.expires_at) }
}
