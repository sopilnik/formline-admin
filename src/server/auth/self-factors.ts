import 'server-only'
import { and, count, eq, isNull } from 'drizzle-orm'
import type { AuthFailure } from '@/lib/auth-form'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { isRecentAuth } from '@/server/auth/reauth'
import { generateRecoveryCodes, hashRecoveryCode, RECOVERY_CODE_COUNT } from '@/server/auth/recovery-codes'
import { workspaceContext, type Session } from '@/server/auth/sessions'
import { encryptTotpSecret, parseTotpSecret, verifyTotp } from '@/server/auth/totp'
import { logActivity } from '@/server/dal/activity'
import { countPasskeys } from '@/server/dal/passkeys'
import { deleteOtherOwnSessions } from '@/server/dal/sessions'
import { isUser, lockSelf, type Who } from '@/server/dal/users'
import { recoveryCodes, users } from '@/server/db/schema'
import { withWorkspace, type Tx } from '@/server/db/with-workspace'
import { hashIp } from '@/server/ratelimit/ip'

type Meta = { ip: string | null }

/** One's own recovery codes, by workspace and user. */
export const ownCodes = (who: Who) => and(eq(recoveryCodes.workspaceId, who.workspaceId), eq(recoveryCodes.userId, who.userId))

/** How many of one's recovery codes are still unused. */
export async function countUnusedRecoveryCodes(tx: Tx, who: Who): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(recoveryCodes).where(and(ownCodes(who), isNull(recoveryCodes.usedAt)))
  return row?.n ?? 0
}

/** Ten new codes in place of every old one; the plain codes are shown once (spec §5.3). */
async function replaceRecoveryCodes(tx: Tx, session: Session): Promise<string[]> {
  const codes = generateRecoveryCodes()
  await tx.delete(recoveryCodes).where(ownCodes(session))
  await tx.insert(recoveryCodes).values(codes.map(code => ({ workspaceId: session.workspaceId, userId: session.userId, codeHash: hashRecoveryCode(code) })))
  return codes
}

/**
 * Turns the authenticator on, or replaces it (spec §5.3, §8.8): the key the page showed and its first code.
 * A first authenticator comes with ten new recovery codes. Every other session ends (spec §5.1); the owner
 * needs a recent authentication, a sandbox does not.
 */
export async function enableOwnTotp(
  session: Session,
  input: { secret: string; code: string } & Meta,
  overrides: Partial<AuthDeps> = {},
): Promise<{ ok: true; recoveryCodes: string[] | null } | AuthFailure<'code'>> {
  const deps = authDeps(overrides)
  if (!isRecentAuth(session, deps.now())) return { ok: false, error: 'reauth_required' }
  const secret = parseTotpSecret(input.secret)
  const totp = secret ? verifyTotp(secret, input.code, null, deps.now()) : null
  if (!secret || !totp?.ok) return { ok: false, error: 'code_invalid', field: 'code' }
  const totpSecretEnc = encryptTotpSecret(secret, { workspaceId: session.workspaceId, userId: session.userId }, deps.config.totpKeys)
  return withWorkspace(workspaceContext(session), async tx => {
    const [self] = await tx.select({ had: users.totpSecretEnc }).from(users).where(isUser(session))
    const replacing = self?.had != null
    await tx.update(users).set({ totpSecretEnc, totpLastStep: totp.step }).where(isUser(session))
    const codes = replacing ? null : await replaceRecoveryCodes(tx, session)
    await deleteOtherOwnSessions(tx, session)
    await logActivity(tx, session.workspaceId, {
      actorUserId: session.userId, action: replacing ? 'auth.totp_replaced' : 'auth.totp_enabled', entityType: 'user', entityId: session.userId,
      ipHash: hashIp(input.ip, deps.config.ipHashKey),
    })
    return { ok: true, recoveryCodes: codes }
  }, deps.pool)
}

/** Turns the authenticator off — never the owner's last factor (spec §5.3); every other session ends. */
export async function disableOwnTotp(session: Session, meta: Meta, overrides: Partial<AuthDeps> = {}): Promise<{ ok: true } | AuthFailure> {
  const deps = authDeps(overrides)
  if (!isRecentAuth(session, deps.now())) return { ok: false, error: 'reauth_required' }
  return withWorkspace(workspaceContext(session), async (tx): Promise<{ ok: true } | AuthFailure> => {
    await lockSelf(tx, session)
    const [self] = await tx.select({ totp: users.totpSecretEnc }).from(users).where(isUser(session))
    if (!self?.totp) return { ok: false, error: 'generic' }
    if (session.workspaceKind === 'owner' && (await countPasskeys(tx, session)) === 0) return { ok: false, error: 'last_factor' }

    await tx.update(users).set({ totpSecretEnc: null, totpLastStep: null }).where(isUser(session))
    await deleteOtherOwnSessions(tx, session)
    await logActivity(tx, session.workspaceId, {
      actorUserId: session.userId, action: 'auth.totp_disabled', entityType: 'user', entityId: session.userId, ipHash: hashIp(meta.ip, deps.config.ipHashKey),
    })
    return { ok: true }
  }, deps.pool)
}

/** Ten new recovery codes; the old ones stop working (spec §5.3). Only beside a second factor they stand in for. */
export async function regenerateOwnRecoveryCodes(session: Session, meta: Meta, overrides: Partial<AuthDeps> = {}): Promise<{ ok: true; recoveryCodes: string[] } | AuthFailure> {
  const deps = authDeps(overrides)
  if (!isRecentAuth(session, deps.now())) return { ok: false, error: 'reauth_required' }
  return withWorkspace(workspaceContext(session), async (tx): Promise<{ ok: true; recoveryCodes: string[] } | AuthFailure> => {
    const [self] = await tx.select({ totp: users.totpSecretEnc }).from(users).where(isUser(session))
    if (!self?.totp && (await countPasskeys(tx, session)) === 0) return { ok: false, error: 'generic' }
    const codes = await replaceRecoveryCodes(tx, session)
    await logActivity(tx, session.workspaceId, {
      actorUserId: session.userId, action: 'auth.recovery_codes_regenerated', entityType: 'user', entityId: session.userId,
      details: { count: RECOVERY_CODE_COUNT }, ipHash: hashIp(meta.ip, deps.config.ipHashKey),
    })
    return { ok: true, recoveryCodes: codes }
  }, deps.pool)
}
