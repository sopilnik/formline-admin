import 'server-only'
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { AuthFailure } from '@/lib/auth-form'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { securityNotice } from '@/server/auth/notices'
import { hashRecoveryCode, normalizeRecoveryCode } from '@/server/auth/recovery-codes'
import { deleteSession, type Session } from '@/server/auth/sessions'
import { countUnusedRecoveryCodes, ownCodes } from '@/server/auth/self-factors'
import { finishSignIn, type SignedIn } from '@/server/auth/sign-in'
import { decryptTotpSecret, isTotpShape, verifyTotp } from '@/server/auth/totp'
import { logActivity } from '@/server/dal/activity'
import { getSelf, isUser } from '@/server/dal/users'
import { recoveryCodes, users } from '@/server/db/schema'
import { withWorkspace, workspaceContext, type Tx } from '@/server/db/with-workspace'
import { claimAttempt, giveBack } from '@/server/ratelimit/attempts'
import { hashIp, userSubject } from '@/server/ratelimit/ip'
import { GUARDS } from '@/server/ratelimit/limits'

type Method = 'totp' | 'recovery_code'
type Check = { ok: true; method: Method; remaining?: number } | { ok: false }

async function checkCode(tx: Tx, { session, code }: { session: Session; code: string }, deps: AuthDeps): Promise<Check> {
  const digits = code.replace(/\s+/g, '')

  if (isTotpShape(digits)) {
    const [row] = await tx.select({ secret: users.totpSecretEnc, lastStep: users.totpLastStep }).from(users).where(isUser(session))

    if (!row?.secret) return { ok: false }

    const secret = decryptTotpSecret(row.secret, { workspaceId: session.workspaceId, userId: session.userId }, deps.config.totpKeys)
    const result = verifyTotp(secret, { code: digits, lastStep: row.lastStep }, deps.now())

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
 * One second-factor attempt: an authenticator code or a recovery code. Every attempt
 * is counted before its code is checked, and a right code gives its slot back; the
 * tenth that fails in an hour locks the second factor for an hour, ends the session
 * and notifies the user. A locked factor ends the session too.
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

  const claim = await claimAttempt(GUARDS.secondFactor, subject, pool)

  if (!claim.ok) {
    await withWorkspace(ctx, tx => deleteSession(tx, session), pool)

    return { ok: false, error: 'second_factor_locked' }
  }

  const check = await withWorkspace(ctx, async tx => {
    const result = await checkCode(tx, { session, code: input.code }, deps)

    if (result.ok && result.method === 'recovery_code') {
      const self = (await getSelf(tx, session))!

      await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.recovery_code_used', details: { remaining: result.remaining }, ipHash })
      await securityNotice(tx, session.workspaceId, { user: self, kind: 'auth.recovery_code_used', details: { remaining: result.remaining }, at: new Date(deps.now()) })
    }

    return result
  }, pool)

  if (check.ok) {
    await giveBack(GUARDS.secondFactor, subject, claim, pool)

    return { ok: true, method: check.method }
  }

  if (claim.lockStart) {
    await withWorkspace(ctx, async tx => {
      const self = (await getSelf(tx, session))!

      await deleteSession(tx, session)
      await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.second_factor_locked', ipHash })
      await securityNotice(tx, session.workspaceId, { user: self, kind: 'auth.second_factor_locked', details: {}, at: new Date(deps.now()) })
    }, pool)

    return { ok: false, error: 'second_factor_locked' }
  }
  await withWorkspace(ctx, tx => logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.second_factor_failed', ipHash }), pool)

  return { ok: false, error: 'code_invalid', field: 'code' }
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
    at: new Date(deps.now()),
    pending: session,
  }), deps.pool)

  // The pending session ended while its code was checked (the lock of a parallel attempt, its expiry): no sign-in.
  if (!signedIn) return { ok: false, error: 'session_expired' }

  return { ok: true, ...signedIn }
}
