import 'server-only'
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import type { AuthFailure } from '@/lib/auth-form'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { securityNotice } from '@/server/auth/notices'
import { hashRecoveryCode, normalizeRecoveryCode } from '@/server/auth/recovery-codes'
import { deleteSession, workspaceContext, type Session } from '@/server/auth/sessions'
import { countUnusedRecoveryCodes, ownCodes } from '@/server/auth/self-factors'
import { finishSignIn, type SignedIn } from '@/server/auth/sign-in'
import { decryptTotpSecret, isTotpShape, verifyTotp } from '@/server/auth/totp'
import { logActivity } from '@/server/dal/activity'
import { getSelf, isUser } from '@/server/dal/users'
import { recoveryCodes, users } from '@/server/db/schema'
import { withWorkspace, type Tx } from '@/server/db/with-workspace'
import { consume, lockRemaining, setLock } from '@/server/ratelimit/consume'
import { hashIp, userSubject } from '@/server/ratelimit/ip'
import { LIMITS, LOCKS, SECOND_FACTOR_LOCK_SECONDS } from '@/server/ratelimit/limits'

type Method = 'totp' | 'recovery_code'
type Check = { ok: true; method: Method; remaining?: number } | { ok: false }

async function checkCode(tx: Tx, session: Session, code: string, deps: AuthDeps): Promise<Check> {
  const digits = code.replace(/\s+/g, '')
  if (isTotpShape(digits)) {
    const [row] = await tx.select({ secret: users.totpSecretEnc, lastStep: users.totpLastStep }).from(users).where(isUser(session))
    if (!row?.secret) return { ok: false }
    const secret = decryptTotpSecret(row.secret, { workspaceId: session.workspaceId, userId: session.userId }, deps.config.totpKeys)
    const result = verifyTotp(secret, digits, row.lastStep, deps.now())
    if (!result.ok) return { ok: false }
    // Conditional on the stored step, so two requests with the same code cannot both pass.
    const stored = await tx.update(users)
      .set({ totpLastStep: result.step })
      .where(and(isUser(session), or(isNull(users.totpLastStep), lt(users.totpLastStep, result.step))))
      .returning({ id: users.id })
    return stored.length === 1 ? { ok: true, method: 'totp' } : { ok: false }
  }
  const normalized = normalizeRecoveryCode(code)
  if (!normalized) return { ok: false }
  const used = await tx.update(recoveryCodes)
    .set({ usedAt: sql`now()` })
    .where(and(ownCodes(session), eq(recoveryCodes.codeHash, hashRecoveryCode(normalized)), isNull(recoveryCodes.usedAt)))
    .returning({ id: recoveryCodes.id })
  if (used.length !== 1) return { ok: false }
  return { ok: true, method: 'recovery_code', remaining: await countUnusedRecoveryCodes(tx, session) }
}

/**
 * One second-factor attempt: an authenticator code or a recovery code. The tenth
 * failure in an hour locks the second factor for an hour, ends the session and
 * notifies the user (spec §5.4, amended); a locked factor ends the session too.
 */
export async function attemptSecondFactor(
  session: Session,
  input: { code: string; ip: string | null },
  overrides: Partial<AuthDeps> = {},
): Promise<{ ok: true; method: Method } | AuthFailure<'code'>> {
  const deps = authDeps(overrides)
  const { pool, config } = deps
  const ctx = workspaceContext(session)
  const subject = userSubject(session.workspaceId, session.userId)
  const ipHash = hashIp(input.ip, config.ipHashKey)

  if (await lockRemaining(LOCKS.secondFactor, subject, pool) > 0) {
    await withWorkspace(ctx, tx => deleteSession(tx, session), pool)
    return { ok: false, error: 'second_factor_locked' }
  }

  const check = await withWorkspace(ctx, async tx => {
    const result = await checkCode(tx, session, input.code, deps)
    if (result.ok && result.method === 'recovery_code') {
      const self = (await getSelf(tx, session))!
      await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.recovery_code_used', details: { remaining: result.remaining }, ipHash })
      await securityNotice(tx, session.workspaceId, self, 'auth.recovery_code_used', { remaining: result.remaining })
    }
    return result
  }, pool)
  if (check.ok) return { ok: true, method: check.method }

  if (await recordSecondFactorFailure(subject, pool)) {
    await withWorkspace(ctx, async tx => {
      const self = (await getSelf(tx, session))!
      await deleteSession(tx, session)
      await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.second_factor_locked', ipHash })
      await securityNotice(tx, session.workspaceId, self, 'auth.second_factor_locked', {})
    }, pool)
    return { ok: false, error: 'second_factor_locked' }
  }
  await withWorkspace(ctx, tx => logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.second_factor_failed', ipHash }), pool)
  return { ok: false, error: 'code_invalid', field: 'code' }
}

/**
 * Counts a wrong code against a user's second factor, on sign-in and on a switch to them alike: the failure that reaches
 * the hour's limit starts the hour's lock (spec §5.4). Answers whether the factor is locked now.
 */
export async function recordSecondFactorFailure(subject: string, pool: Pool): Promise<boolean> {
  const failures = await consume(LIMITS.secondFactorFail, subject, pool)
  if (failures.count < LIMITS.secondFactorFail.limit) return false

  await setLock(LOCKS.secondFactor, subject, SECOND_FACTOR_LOCK_SECONDS, pool)
  return true
}

/** Step two of the password sign-in (the /sign-in/verify page). */
export async function verifySecondFactor(
  session: Session,
  input: { code: string; ip: string | null; userAgent: string | null },
  overrides: Partial<AuthDeps> = {},
): Promise<({ ok: true } & SignedIn) | AuthFailure<'code'>> {
  const deps = authDeps(overrides)
  const attempt = await attemptSecondFactor(session, input, deps)
  if (!attempt.ok) return attempt
  const signedIn = await withWorkspace(workspaceContext(session), tx => finishSignIn(tx, {
    workspaceId: session.workspaceId,
    userId: session.userId,
    method: 'password',
    userAgent: input.userAgent,
    ipHash: hashIp(input.ip, deps.config.ipHashKey),
    pending: session,
  }), deps.pool)
  return { ok: true, ...signedIn }
}
