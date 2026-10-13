import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Pool } from 'pg'
import { cache } from 'react'
import { generateToken, hashToken, TOKEN_PATTERN } from '@/server/auth/tokens'
import type { WorkspaceKind } from '@/server/authz/matrix'
import { sessionSignInId } from '@/server/dal/sessions'
import { getPool } from '@/server/db/pool'
import { sessions } from '@/server/db/schema'
import type { Role, Tx } from '@/server/db/with-workspace'

export const SESSION_COOKIE = '__Host-formline_session'

/**
 * Set beside the session cookie of a sandbox and cleared by every owner sign-in
 * and by sign-out. A request whose session no longer resolves while this marker
 * is present belongs to a visitor whose sandbox has ended.
 */
export const DEMO_COOKIE = '__Host-formline_demo'

const COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const

/** The kinds of workspace a person signs in to: the template has no sessions. */
type SessionKind = Exclude<WorkspaceKind, 'template'>

export type Session = {
  /** The token hash, which is the row's key. */
  id: string
  workspaceId: string
  workspaceKind: SessionKind
  userId: string
  role: Role
  secondFactorVerified: boolean
  reauthAt: Date | null
  expiresAt: Date
}

export type NewSession = { token: string; id: string; expiresAt: Date }

/** A session this code wrote, with the id of the sign-in it belongs to (it survives every rotation). */
export type CreatedSession = NewSession & { signInId: string }

type SessionRow = {
  workspace_id: string
  workspace_kind: SessionKind
  user_id: string
  role: Role
  second_factor_verified: boolean
  reauth_at: Date | null
  expires_at: Date
}

/** Resolves a raw cookie token; null for anything malformed, unknown, expired or idle. */
export async function validateSessionToken(token: string, pool: Pool = getPool()): Promise<Session | null> {
  if (!TOKEN_PATTERN.test(token)) return null
  const id = hashToken(token)
  const { rows } = await pool.query<SessionRow>('select * from fa.auth_session($1)', [id])
  const row = rows[0]
  if (!row) return null
  return {
    id,
    workspaceId: row.workspace_id,
    workspaceKind: row.workspace_kind,
    userId: row.user_id,
    role: row.role,
    secondFactorVerified: row.second_factor_verified,
    reauthAt: row.reauth_at,
    expiresAt: row.expires_at,
  }
}

/**
 * Inserts a session in the caller's transaction. A pending session (second factor
 * not yet given) lives 10 minutes; a verified one 7 days. A new sign-in
 * gets a new sign-in id; a rotation passes the old one on.
 */
export async function createSession(
  tx: Tx,
  input: { workspaceId: string; userId: string; verified: boolean; userAgentSummary: string | null; ipHash: string | null; signInId?: string },
): Promise<CreatedSession> {
  const token = generateToken()
  const id = hashToken(token)
  const [row] = await tx.insert(sessions).values({
    workspaceId: input.workspaceId,
    id,
    userId: input.userId,
    expiresAt: input.verified ? sql`now() + interval '7 days'` : sql`now() + interval '10 minutes'`,
    secondFactorVerified: input.verified,
    reauthAt: input.verified ? sql`now()` : null,
    userAgentSummary: input.userAgentSummary,
    ipHash: input.ipHash,
    ...(input.signInId ? { signInId: input.signInId } : {}),
  }).returning({ expiresAt: sessions.expiresAt, signInId: sessions.signInId })
  return { token, id, expiresAt: row!.expiresAt, signInId: row!.signInId }
}

/**
 * A fresh token for a full authentication (the second factor, or a re-authentication):
 * the old row is deleted, the new session is verified with a new lifetime.
 * The sign-in id stays, so the device is still the one that signed in. Null when the
 * old row is already gone: a session that ended meanwhile (a lock, a sign-out elsewhere,
 * its expiry) is never turned into a new one.
 */
export async function rotateSession(tx: Tx, session: Session, meta: { userAgentSummary: string | null; ipHash: string | null }): Promise<CreatedSession | null> {
  const signInId = await sessionSignInId(tx, session.id)
  const deleted = await tx.delete(sessions)
    .where(and(eq(sessions.workspaceId, session.workspaceId), eq(sessions.id, session.id)))
    .returning({ id: sessions.id })
  if (deleted.length === 0) return null

  return createSession(tx, { workspaceId: session.workspaceId, userId: session.userId, verified: true, ...meta, ...(signInId ? { signInId } : {}) })
}

export async function deleteSession(tx: Tx, session: Session): Promise<void> {
  await tx.delete(sessions).where(and(eq(sessions.workspaceId, session.workspaceId), eq(sessions.id, session.id)))
}

// The session cookie can only be written by Server Actions and route handlers.
// __Host- requires Secure and Path=/ and forbids Domain; SameSite=Lax is what
// stops a cross-site POST when a browser sends no Origin.
export async function setSessionCookie(token: string, expiresAt: Date, options: { demo?: boolean } = {}): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, { ...COOKIE, expires: expiresAt })
  if (options.demo) store.set(DEMO_COOKIE, '1', { ...COOKIE, expires: expiresAt })
  else store.set(DEMO_COOKIE, '', { ...COOKIE, maxAge: 0 })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', { ...COOKIE, maxAge: 0 })
  store.set(DEMO_COOKIE, '', { ...COOKIE, maxAge: 0 })
}

/** The current request's session, resolved once per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return token ? validateSessionToken(token) : null
})

/**
 * For pages and Server Actions: a verified session, or a redirect into the
 * sign-in flow. `pending: true` also accepts a session that still waits for its
 * second factor (the verification step itself). A missing session with the demo
 * marker cookie lands on the ended-sandbox notice.
 */
export async function requireSession(options: { pending?: boolean } = {}): Promise<Session> {
  const session = await getSession()
  if (!session) redirect((await cookies()).has(DEMO_COOKIE) ? '/sign-in?ended=1' : '/sign-in')
  if (!session.secondFactorVerified && !options.pending) redirect('/sign-in/verify')
  return session
}
