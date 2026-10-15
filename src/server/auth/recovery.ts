import 'server-only'
import type { AuthFailure } from '@/lib/auth-form'
import { checkNewCredentials, sealCredentials } from '@/server/auth/credentials'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { findOwner, ownerWorkspaceId } from '@/server/auth/owner'
import { hashToken, TOKEN_PATTERN } from '@/server/auth/tokens'
import { summarizeUserAgent } from '@/server/auth/user-agent'
import { logActivity } from '@/server/dal/activity'
import { withWorkspace } from '@/server/db/with-workspace'
import { clearSubject, consume } from '@/server/ratelimit/consume'
import { accountSubject, hashIp, ipSubject, userSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'

export type RecoverField = 'recoveryCode' | 'password' | 'code'

export type RecoverInput = {
  recoveryCode: string
  password: string
  totpSecret: string
  code: string
  ip: string | null
  userAgent: string | null
}

/** Redeems a code printed by `pnpm owner:recovery` for a new password, authenticator and recovery codes. */
export async function recoverOwner(
  input: RecoverInput,
  overrides: Partial<AuthDeps> = {},
): Promise<{ ok: true; token: string; expiresAt: Date; recoveryCodes: string[] } | AuthFailure<RecoverField>> {
  const deps = authDeps(overrides)
  const { pool, config } = deps
  const attempt = await consume(LIMITS.recoverIp, ipSubject(input.ip, config.ipHashKey), pool)

  if (!attempt.allowed) {
    return { ok: false, error: 'rate_limited', retryAfterSeconds: attempt.retryAfterSeconds }
  }

  const recoveryCode = input.recoveryCode.trim().toLowerCase()

  if (!TOKEN_PATTERN.test(recoveryCode)) {
    return { ok: false, error: 'recovery_invalid', field: 'recoveryCode' }
  }

  const checked = await checkNewCredentials(input, deps)

  if (!checked.ok) {
    return checked
  }

  const owner = await findOwner(pool)

  if (!owner) {
    return { ok: false, error: 'recovery_invalid', field: 'recoveryCode' }
  }

  const workspaceId = await ownerWorkspaceId(pool)
  const sealed = await sealCredentials({ password: input.password, secret: checked.secret, workspaceId, userId: owner.id }, deps)
  const ipHash = hashIp(input.ip, config.ipHashKey)
  const { rows } = await pool.query<{ expires: Date | null }>(
    'select fa.redeem_owner_recovery($1, $2, $3, $4, $5, $6, $7, $8, $9) as expires',
    [hashToken(recoveryCode), owner.id, sealed.passwordHash, sealed.totpSecretEnc, checked.step, sealed.recoveryHashes,
      sealed.sessionHash, summarizeUserAgent(input.userAgent), ipHash])
  const expiresAt = rows[0]?.expires

  if (!expiresAt) {
    return { ok: false, error: 'recovery_invalid', field: 'recoveryCode' }
  }

  // Whoever holds the lost factors may have locked the account: recovery lifts both locks.
  await clearSubject(userSubject(workspaceId, owner.id), pool)
  await clearSubject(accountSubject(owner.email, config.ipHashKey), pool)
  await withWorkspace({ workspaceId, userId: owner.id, role: 'owner' }, tx => logActivity(tx, workspaceId, {
    actorUserId: owner.id,
    action: 'auth.owner_recovered',
    entityType: 'user',
    entityId: owner.id,
    ipHash,
  }), pool)

  return { ok: true, token: sealed.sessionToken, expiresAt, recoveryCodes: sealed.recoveryCodes }
}
