import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Locale } from '@/i18n/locale'
import type { AuthFailure } from '@/lib/auth-form'
import { EMAIL_MAX, memberName } from '@/lib/team'
import type { Theme } from '@/lib/theme'
import { checkNewCredentials, sealCredentials } from '@/server/auth/credentials'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { ownerWorkspaceId } from '@/server/auth/owner'
import { sameSecret } from '@/server/auth/tokens'
import { summariseUserAgent } from '@/server/auth/user-agent'
import { logActivity } from '@/server/dal/activity'
import { updateSelfPreferences } from '@/server/dal/users'
import { isUniqueViolation } from '@/server/db/errors'
import { withWorkspace } from '@/server/db/with-workspace'
import { consume } from '@/server/ratelimit/consume'
import { hashIp, ipSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'

export type SetupField = 'token' | 'name' | 'email' | 'password' | 'code'

export type SetupInput = {
  token: string
  name: string
  email: string
  password: string
  totpSecret: string
  code: string
  ip: string | null
  userAgent: string | null
  locale: Locale
  theme: Theme
}

/**
 * The one-time owner setup (spec §5.8, amended): the token from OWNER_SETUP_TOKEN,
 * compared in constant time, then the owner with a password and an authenticator
 * in one definer call.
 */
export async function setupOwner(
  input: SetupInput,
  overrides: Partial<AuthDeps> = {},
): Promise<{ ok: true; token: string; expiresAt: Date; recoveryCodes: string[] } | AuthFailure<SetupField>> {
  const deps = authDeps(overrides)
  const { config, pool } = deps
  if (!config.setupToken) return { ok: false, error: 'unavailable' }
  const attempt = await consume(LIMITS.setupIp, ipSubject(input.ip, config.ipHashKey), pool)
  if (!attempt.allowed) return { ok: false, error: 'rate_limited', retryAfterSeconds: attempt.retryAfterSeconds }
  if (!sameSecret(input.token.trim(), config.setupToken)) return { ok: false, error: 'token_invalid', field: 'token' }
  const name = memberName(input.name)
  if (!name) return { ok: false, error: 'name_required', field: 'name' }
  const email = input.email.trim()
  if (!z.email().max(EMAIL_MAX).safeParse(email).success) return { ok: false, error: 'email_invalid', field: 'email' }
  const checked = await checkNewCredentials(input, deps)
  if (!checked.ok) return checked

  const workspaceId = await ownerWorkspaceId(pool)
  const userId = randomUUID()
  const sealed = await sealCredentials({ password: input.password, secret: checked.secret, workspaceId, userId }, deps)
  const ipHash = hashIp(input.ip, config.ipHashKey)
  let expiresAt: Date
  try {
    const { rows } = await pool.query<{ expires: Date }>(
      'select fa.create_owner($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as expires',
      [userId, email, name, sealed.passwordHash, sealed.totpSecretEnc, checked.step, sealed.recoveryHashes,
        sealed.sessionHash, summariseUserAgent(input.userAgent), ipHash])
    expiresAt = rows[0]!.expires
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'owner_exists' }
    throw error
  }
  await withWorkspace({ workspaceId, userId, role: 'owner' }, async tx => {
    await updateSelfPreferences(tx, { workspaceId, userId }, { locale: input.locale, theme: input.theme })
    await logActivity(tx, workspaceId, { actorUserId: userId, action: 'auth.owner_created', entityType: 'user', entityId: userId, ipHash })
  }, pool)
  return { ok: true, token: sealed.sessionToken, expiresAt, recoveryCodes: sealed.recoveryCodes }
}
