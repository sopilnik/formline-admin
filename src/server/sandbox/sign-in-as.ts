import 'server-only'
import { sql } from 'drizzle-orm'
import type { Locale } from '@/i18n/locale'
import type { AuthFailure } from '@/lib/auth-form'
import type { Theme } from '@/lib/theme'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { securityNotice } from '@/server/auth/notices'
import { type NewSession, type Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { decryptTotpSecret, verifyTotp } from '@/server/auth/totp'
import { logActivity } from '@/server/dal/activity'
import { getMemberFactor, getSelf, updateSelfPreferences } from '@/server/dal/users'
import { asDate } from '@/server/db/as-date'
import { withWorkspace, workspaceContext, type WorkspaceContext } from '@/server/db/with-workspace'
import { claimAttempt, giveBack, type Granted } from '@/server/ratelimit/attempts'
import { userSubject } from '@/server/ratelimit/ip'
import { GUARDS, SECOND_FACTOR_LOCK_SECONDS } from '@/server/ratelimit/limits'

export type SwitchInput = {
  targetUserId: string
  code: string
  userAgentSummary: string | null
  ipHash: string | null
  /** The language and theme the visitor sees now. */
  preferences: { locale: Locale; theme: Theme }
}

/**
 * "Switch user" in a sandbox: a verified session of another demo user
 * replaces the current one. A target with an enrolled authenticator asks for its
 * code first, under the same per-account limit and lock as sign-in.
 * The member takes the language and theme the visitor sees, so the profile, and the
 * letters written in the member's language, agree with the interface; and the
 * visitor's shortcut switch, so shortcuts turned off stay off (WCAG 2.2 SC 2.1.4).
 */
export async function switchUser(session: Session, input: SwitchInput, overrides: Partial<AuthDeps> = {}): Promise<({ ok: true } & NewSession) | AuthFailure<'code'>> {
  const deps = authDeps(overrides)
  if (session.workspaceKind !== 'sandbox') return { ok: false, error: 'generic' }

  const ctx = workspaceContext(session)
  const { target, shortcutsEnabled } = await withWorkspace(ctx, async tx => ({
    target: await getMemberFactor(tx, { workspaceId: session.workspaceId, userId: input.targetUserId }),
    shortcutsEnabled: (await getSelf(tx, session))?.shortcutsEnabled ?? true,
  }), deps.pool)
  if (!target || target.deactivatedAt || target.id === session.userId) return { ok: false, error: 'generic' }

  const subject = userSubject(session.workspaceId, target.id)
  let step: number | null = null
  let claim: Granted | null = null
  if (target.totpSecretEnc) {
    const claimed = await claimAttempt(GUARDS.secondFactor, subject, deps.pool)
    if (!claimed.ok) return { ok: false, error: 'member_locked', field: 'code', retryAfterSeconds: claimed.retryAfterSeconds }
    claim = claimed

    const secret = decryptTotpSecret(target.totpSecretEnc, { workspaceId: session.workspaceId, userId: target.id }, deps.config.totpKeys)
    const verdict = verifyTotp(secret, input.code, target.totpLastStep, deps.now())
    if (!verdict.ok) return wrongCode(ctx, target.id, claim, input.ipHash, deps)
    step = verdict.step
  }

  const token = generateToken()
  const id = hashToken(token)
  const result = await withWorkspace(ctx, tx => tx.execute<{ expires_at: string | null }>(
    sql`select fa.sandbox_sign_in_as(${target.id}, ${session.id}, ${id}, ${step}, ${input.userAgentSummary}, ${input.ipHash}) as expires_at`), deps.pool)
  const expiresAt = result.rows[0]!.expires_at
  // Null: a switch that ran alongside this one stored the code's step first, so the code is used.
  if (expiresAt === null) return wrongCode(ctx, target.id, claim!, input.ipHash, deps)
  if (claim) await giveBack(GUARDS.secondFactor, subject, claim, deps.pool)

  // Row-level security lets a member write only their own row, so this runs as the member just switched to.
  await withWorkspace({ ...ctx, userId: target.id, role: target.role }, tx => updateSelfPreferences(tx, { workspaceId: session.workspaceId, userId: target.id }, { ...input.preferences, shortcutsEnabled }), deps.pool)
  return { ok: true, token, id, expiresAt: asDate(expiresAt) }
}

/**
 * A wrong code for a member's authenticator. The one whose claim set the lock tells the member, as the owner hears of
 * theirs: in the log, the bell and a letter.
 */
async function wrongCode(ctx: WorkspaceContext, targetId: string, claim: Granted, ipHash: string | null, deps: AuthDeps): Promise<AuthFailure<'code'>> {
  if (!claim.lockStart) return { ok: false, error: 'code_invalid', field: 'code' }

  await withWorkspace(ctx, async tx => {
    const member = (await getSelf(tx, { workspaceId: ctx.workspaceId, userId: targetId }))!
    await logActivity(tx, ctx.workspaceId, { actorUserId: targetId, action: 'auth.second_factor_locked', ipHash })
    await securityNotice(tx, ctx.workspaceId, member, 'auth.second_factor_locked', {}, { at: new Date(deps.now()) })
  }, deps.pool)
  // The member is told, not the owner: the message says so (the owner's own sign-in keeps second_factor_locked).
  return { ok: false, error: 'member_locked', field: 'code', retryAfterSeconds: SECOND_FACTOR_LOCK_SECONDS }
}
