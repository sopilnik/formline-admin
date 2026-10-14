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
import { claimAttempt, giveBack, type Granted } from '@/server/ratelimit/attempts'
import { consume, release, type Counted } from '@/server/ratelimit/consume'
import { accountSubject, hashIp, ipSubject } from '@/server/ratelimit/ip'
import { GUARDS, LIMITS } from '@/server/ratelimit/limits'

export type SignInInput = { email: string; password: string; ip: string | null; userAgent: string | null }

/** The fields of the owner's sign-in form that an error can name. */
export type SignInField = 'email' | 'password'
export type SignedIn = { token: string; expiresAt: Date; locale: Locale; theme: Theme }

type PasswordAttempt = { email: string; ip: string | null }

/** A password that may be checked, with the slots a right one gives back; or the seconds until one may. */
export type PasswordClaim = { ok: true; address: Counted; account: Granted } | { ok: false; retryAfterSeconds: number }

/**
 * Counts a password attempt before it is checked: at the address (20 in 15 minutes), then on the account, one claim
 * at a time, whose fifth failure in an hour locks it for 15 minutes and every further one doubles the lock. An attempt
 * a locked account refuses checks no password, so the address gets its slot back.
 */
export async function claimPasswordAttempt(input: PasswordAttempt, deps: AuthDeps): Promise<PasswordClaim> {
  const { pool, config } = deps
  const addressSubject = ipSubject(input.ip, config.ipHashKey)
  const address = await consume(LIMITS.signInFailIp, addressSubject, pool)
  if (!address.allowed) return { ok: false, retryAfterSeconds: address.retryAfterSeconds }

  const account = await claimAttempt(GUARDS.password, accountSubject(input.email, config.ipHashKey), pool)
  if (!account.ok) {
    await release(LIMITS.signInFailIp, addressSubject, address.windowStart, pool)
    return account
  }
  return { ok: true, address, account }
}

/** A right password: both slots are given back, and the lock its claim set, if any, is lifted. */
export async function passwordAccepted(input: PasswordAttempt, claim: Extract<PasswordClaim, { ok: true }>, deps: AuthDeps): Promise<void> {
  const { pool, config } = deps
  await release(LIMITS.signInFailIp, ipSubject(input.ip, config.ipHashKey), claim.address.windowStart, pool)
  await giveBack(GUARDS.password, accountSubject(input.email, config.ipHashKey), claim.account, pool)
}

/**
 * Step one of the owner sign-in. Success is a pending session that reaches only
 * the second-factor step. A wrong email and a wrong password fail the
 * same way, after the same hashing work; an empty field is named before any attempt is counted.
 */
export async function signInWithPassword(input: SignInInput, overrides: Partial<AuthDeps> = {}): Promise<{ ok: true; token: string; expiresAt: Date } | AuthFailure<SignInField>> {
  const deps = authDeps(overrides)
  const { pool, config } = deps
  if (!input.email.trim()) return { ok: false, error: 'email_required', field: 'email' }
  if (!input.password) return { ok: false, error: 'password_required', field: 'password' }

  const claim = await claimPasswordAttempt(input, deps)
  if (!claim.ok) return { ok: false, error: 'rate_limited', retryAfterSeconds: claim.retryAfterSeconds }

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

  await passwordAccepted(input, claim, deps)
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

type Finish = {
  workspaceId: string
  userId: string
  method: 'password' | 'passkey'
  userAgent: string | null
  ipHash: string | null
  at: Date
}

/**
 * The end of every sign-in: a verified session (the pending one rotated, or a new
 * one), the activity entry and the new-sign-in notice. A pending session that has
 * ended meanwhile gives null: nothing is written.
 */
export async function finishSignIn(tx: Tx, input: Finish & { pending: Session }): Promise<SignedIn | null>
export async function finishSignIn(tx: Tx, input: Finish): Promise<SignedIn>
export async function finishSignIn(tx: Tx, input: Finish & { pending?: Session }): Promise<SignedIn | null> {
  const meta = { userAgentSummary: summariseUserAgent(input.userAgent), ipHash: input.ipHash }
  const fresh: CreatedSession | null = input.pending
    ? await rotateSession(tx, input.pending, meta)
    : await createSession(tx, { workspaceId: input.workspaceId, userId: input.userId, verified: true, ...meta })
  if (!fresh) return null

  const self = (await getSelf(tx, input))!
  await logActivity(tx, input.workspaceId, { actorUserId: input.userId, action: 'auth.sign_in', details: { method: input.method }, ipHash: input.ipHash })
  await securityNotice(tx, input.workspaceId, self, 'auth.new_sign_in', { device: meta.userAgentSummary }, { at: input.at, signInId: fresh.signInId })
  return { token: fresh.token, expiresAt: fresh.expiresAt, locale: self.locale, theme: self.theme }
}
