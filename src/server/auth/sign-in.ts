import 'server-only'
import { sql } from 'drizzle-orm'
import type { Locale } from '@/i18n/locale'
import type { AuthFailure } from '@/lib/auth-form'
import type { Theme } from '@/lib/theme'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { securityNotice } from '@/server/auth/notices'
import { ownerWorkspaceId } from '@/server/auth/owner'
import { verifyAgainstDummy, verifyPassword } from '@/server/auth/passwords'
import { createSession, rotateSession, type CreatedSession, type Session } from '@/server/auth/sessions'
import { summariseUserAgent } from '@/server/auth/user-agent'
import { logActivity } from '@/server/dal/activity'
import { getSelf } from '@/server/dal/users'
import { users } from '@/server/db/schema'
import { withWorkspace, type Tx } from '@/server/db/with-workspace'
import { consume, lockRemaining, peek, setLock } from '@/server/ratelimit/consume'
import { accountSubject, hashIp, ipSubject } from '@/server/ratelimit/ip'
import { LIMITS, LOCKS, passwordLockSeconds } from '@/server/ratelimit/limits'

export type SignInInput = { email: string; password: string; ip: string | null; userAgent: string | null }
export type SignedIn = { token: string; expiresAt: Date; locale: Locale; theme: Theme }

/** Seconds until this address and this account may try a password again; 0 means now (spec §5.4, amended). */
export async function passwordLockout(input: { email: string; ip: string | null }, deps: AuthDeps): Promise<number> {
  const { pool, config } = deps
  const address = await peek(LIMITS.signInFailIp, ipSubject(input.ip, config.ipHashKey), pool)
  if (!address.allowed) return address.retryAfterSeconds
  return lockRemaining(LOCKS.signInAccount, accountSubject(input.email, config.ipHashKey), pool)
}

/** Counts a wrong password against the address and the account; from the fifth, the account is locked. */
export async function recordPasswordFailure(input: { email: string; ip: string | null }, deps: AuthDeps): Promise<void> {
  const { pool, config } = deps
  await consume(LIMITS.signInFailIp, ipSubject(input.ip, config.ipHashKey), pool)
  const account = accountSubject(input.email, config.ipHashKey)
  const failures = await consume(LIMITS.signInFailAccount, account, pool)
  const lock = passwordLockSeconds(failures.count)
  if (lock > 0) await setLock(LOCKS.signInAccount, account, lock, pool)
}

/**
 * Step one of the owner sign-in. Success is a pending session that reaches only
 * the second-factor step (spec §5.1). A wrong email and a wrong password fail the
 * same way, after the same hashing work (spec §5.2).
 */
export async function signInWithPassword(input: SignInInput, overrides: Partial<AuthDeps> = {}): Promise<{ ok: true; token: string; expiresAt: Date } | AuthFailure> {
  const deps = authDeps(overrides)
  const { pool, config } = deps
  const locked = await passwordLockout(input, deps)
  if (locked > 0) return { ok: false, error: 'rate_limited', retryAfterSeconds: locked }

  const workspaceId = await ownerWorkspaceId(pool)
  const system = { workspaceId, userId: null, role: 'system' } as const
  const [user] = await withWorkspace(system, tx => tx
    .select({ id: users.id, passwordHash: users.passwordHash, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${input.email.trim()})`)
    .limit(1), pool)
  const hash = user && !user.deactivatedAt ? user.passwordHash : null
  const valid = hash ? await verifyPassword(hash, input.password) : await verifyAgainstDummy(input.password)
  const ipHash = hashIp(input.ip, config.ipHashKey)

  if (!user || !hash || !valid) {
    await recordPasswordFailure(input, deps)
    await withWorkspace(system, tx => logActivity(tx, workspaceId, {
      actorUserId: null,
      action: 'auth.sign_in_failed',
      entityType: hash ? 'user' : undefined,
      entityId: hash ? user?.id : undefined,
      details: { method: 'password' },
      ipHash,
    }), pool)
    return { ok: false, error: 'credentials_invalid' }
  }

  const successes = await consume(LIMITS.signInSuccessAccount, accountSubject(input.email, config.ipHashKey), pool)
  if (!successes.allowed) return { ok: false, error: 'rate_limited', retryAfterSeconds: successes.retryAfterSeconds }
  const session = await withWorkspace({ workspaceId, userId: user.id, role: 'system' }, tx => createSession(tx, {
    workspaceId,
    userId: user.id,
    verified: false,
    userAgentSummary: summariseUserAgent(input.userAgent),
    ipHash,
  }), pool)
  return { ok: true, token: session.token, expiresAt: session.expiresAt }
}

/**
 * The end of every sign-in: a verified session (the pending one rotated, or a new
 * one), the activity entry and the new-sign-in notice (spec §5.1, §8.9).
 */
export async function finishSignIn(tx: Tx, input: {
  workspaceId: string
  userId: string
  method: 'password' | 'passkey'
  userAgent: string | null
  ipHash: string | null
  pending?: Session
}): Promise<SignedIn> {
  const meta = { userAgentSummary: summariseUserAgent(input.userAgent), ipHash: input.ipHash }
  const fresh: CreatedSession = input.pending
    ? await rotateSession(tx, input.pending, meta)
    : await createSession(tx, { workspaceId: input.workspaceId, userId: input.userId, verified: true, ...meta })
  const self = (await getSelf(tx, input))!
  await logActivity(tx, input.workspaceId, { actorUserId: input.userId, action: 'auth.sign_in', details: { method: input.method }, ipHash: input.ipHash })
  await securityNotice(tx, input.workspaceId, self, 'auth.new_sign_in', { device: meta.userAgentSummary }, { signInId: fresh.signInId })
  return { token: fresh.token, expiresAt: fresh.expiresAt, locale: self.locale, theme: self.theme }
}
