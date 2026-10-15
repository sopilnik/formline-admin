import 'server-only'
import type { AuthFailure } from '@/lib/auth-form'
import type { AuthDeps } from '@/server/auth/deps'
import { checkPasswordShape, hashPassword } from '@/server/auth/passwords'
import { generateRecoveryCodes, hashRecoveryCode } from '@/server/auth/recovery-codes'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { encryptTotpSecret, parseTotpSecret, verifyTotp } from '@/server/auth/totp'

/** The length and breach rules of a new password, for setup, recovery and a change alike; null when it passes. */
export async function checkNewPassword(password: string, deps: Pick<AuthDeps, 'isBreached'>): Promise<AuthFailure<'password'> | null> {
  const shape = checkPasswordShape(password)

  if (shape !== 'ok') return { ok: false, error: shape === 'too_short' ? 'password_too_short' : 'password_too_long', field: 'password' }
  if (await deps.isBreached(password)) return { ok: false, error: 'password_breached', field: 'password' }

  return null
}

/** A new password and the first code of a new authenticator, as setup and recovery take them. */
export async function checkNewCredentials(
  input: { password: string; totpSecret: string; code: string },
  deps: AuthDeps,
): Promise<{ ok: true; secret: Uint8Array; step: number } | AuthFailure<'password' | 'code'>> {
  const refused = await checkNewPassword(input.password, deps)

  if (refused) return refused

  const secret = parseTotpSecret(input.totpSecret)
  const totp = secret ? verifyTotp(secret, { code: input.code, lastStep: null }, deps.now()) : null

  if (!secret || !totp?.ok) return { ok: false, error: 'code_invalid', field: 'code' }

  return { ok: true, secret, step: totp.step }
}

/** Everything a create or redeem call stores: hashes, the encrypted secret, and the plain codes and token to hand out once. */
export async function sealCredentials(input: { password: string; secret: Uint8Array; workspaceId: string; userId: string }, deps: AuthDeps) {
  const recoveryCodes = generateRecoveryCodes()
  const sessionToken = generateToken()

  return {
    recoveryCodes,
    sessionToken,
    passwordHash: await hashPassword(input.password),
    totpSecretEnc: encryptTotpSecret(input.secret, { workspaceId: input.workspaceId, userId: input.userId }, deps.config.totpKeys),
    recoveryHashes: recoveryCodes.map(hashRecoveryCode),
    sessionHash: hashToken(sessionToken),
  }
}
