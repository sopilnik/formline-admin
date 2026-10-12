import 'server-only'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type { Pool } from 'pg'
import { APP_NAME } from '@/lib/app'
import type { AuthFailure } from '@/lib/auth-form'
import { decodeBase64urlIgnorePadding, decodeHex, encodeBase64urlNoPadding, encodeHexLowerCase } from '@/lib/encoding'
import { authDeps, type AuthDeps } from '@/server/auth/deps'
import { ownerWorkspaceId } from '@/server/auth/owner'
import { isRecentAuth } from '@/server/auth/reauth'
import { rotateSession, workspaceContext, type NewSession, type Session } from '@/server/auth/sessions'
import { signValue, verifySignedValue } from '@/server/auth/signed-cookie'
import { finishSignIn, type SignedIn } from '@/server/auth/sign-in'
import { hashToken } from '@/server/auth/tokens'
import { summariseUserAgent } from '@/server/auth/user-agent'
import type { AuthConfig } from '@/server/config'
import { logActivity } from '@/server/dal/activity'
import { addPasskey, countPasskeys, deletePasskey, findPasskeyByCredential, listPasskeys, recordPasskeyUse, renamePasskey, type Passkey } from '@/server/dal/passkeys'
import { deleteOtherOwnSessions } from '@/server/dal/sessions'
import { getSelf, lockSelf } from '@/server/dal/users'
import { withWorkspace } from '@/server/db/with-workspace'
import { consume, peek } from '@/server/ratelimit/consume'
import { hashIp, ipSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'

type Meta = { ip: string | null; userAgent: string | null }
type Purpose = 'auth' | 'register'
type ChallengePayload = { c: string; p: Purpose; s?: string; e: number }

export const CHALLENGE_COOKIE = '__Host-formline_passkey'
export const CHALLENGE_TTL_SECONDS = 300
export const CHALLENGE_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' } as const

/** The WebAuthn user handle: the 16 bytes of the user id (spec §5.3). */
export function handleFromUserId(userId: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(decodeHex(userId.replace(/-/g, '')))
}

export function userIdFromHandle(handle: string | undefined): string | null {
  if (!handle) return null
  try {
    const bytes = decodeBase64urlIgnorePadding(handle)
    if (bytes.length !== 16) return null
    const hex = encodeHexLowerCase(bytes)
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  } catch {
    return null
  }
}

/** The challenge travels in a signed five-minute cookie: no database row until it is used (spec §5.3, §6.5). */
export function challengeCookie(challenge: string, purpose: Purpose, sessionId: string | undefined, config: AuthConfig, nowMs: number): string {
  const payload: ChallengePayload = { c: challenge, p: purpose, s: sessionId, e: nowMs + CHALLENGE_TTL_SECONDS * 1000 }
  return signValue(payload, config.cookieSigningKey)
}

/** The challenge of an unexpired cookie for this purpose; a registration challenge belongs to one session. */
export function readChallenge(value: string | undefined, purpose: Purpose, sessionId: string | undefined, config: AuthConfig, nowMs: number): string | null {
  if (!value) return null
  const payload = verifySignedValue(value, config.cookieSigningKey) as Partial<ChallengePayload> | null
  if (!payload || payload.p !== purpose || typeof payload.c !== 'string' || typeof payload.e !== 'number' || payload.e <= nowMs) return null
  if (purpose === 'register' && payload.s !== sessionId) return null
  return payload.c
}

/** A challenge counts once: the first use stores its hash (spec §5.3). */
export async function markChallengeUsed(challenge: string, pool: Pool): Promise<boolean> {
  const { rowCount } = await pool.query('insert into fa.used_challenges (challenge_hash) values ($1) on conflict do nothing', [hashToken(challenge)])
  return rowCount === 1
}

export function authenticationOptions(config: AuthConfig): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return generateAuthenticationOptions({ rpID: config.rpId, userVerification: 'required', timeout: CHALLENGE_TTL_SECONDS * 1000 })
}

// SimpleWebAuthn checks the signature counter only when one of the two counters is
// non-zero, as the spec asks: synced passkeys always report 0.
async function verifyAssertion(response: AuthenticationResponseJSON, challenge: string, passkey: Passkey, config: AuthConfig): Promise<{ newCounter: number } | null> {
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(decodeBase64urlIgnorePadding(passkey.publicKey)),
        counter: passkey.counter,
        transports: passkey.transports,
      },
      requireUserVerification: true,
    })
    return result.verified ? { newCounter: result.authenticationInfo.newCounter } : null
  } catch {
    return null
  }
}

export type PasskeySignInResult = ({ ok: true } & SignedIn) | AuthFailure | { ok: false; error: 'passkey_unknown'; credentialId: string }

/** Passkey-first sign-in to the owner workspace: a full sign-in, outside the password lockout (spec §5.3, §5.4). */
export async function signInWithPasskey(
  response: AuthenticationResponseJSON,
  cookie: string | undefined,
  meta: Meta,
  overrides: Partial<AuthDeps> = {},
): Promise<PasskeySignInResult> {
  const deps = authDeps(overrides)
  const { pool, config } = deps
  const address = ipSubject(meta.ip, config.ipHashKey)
  const limit = await peek(LIMITS.passkeyFailIp, address, pool)
  if (!limit.allowed) return { ok: false, error: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds }
  const failed = async (): Promise<AuthFailure> => {
    await consume(LIMITS.passkeyFailIp, address, pool)
    return { ok: false, error: 'passkey_failed' }
  }

  const challenge = readChallenge(cookie, 'auth', undefined, config, deps.now())
  const userId = userIdFromHandle(response.response.userHandle)
  if (!challenge || !userId) return failed()
  const workspaceId = await ownerWorkspaceId(pool)
  // The handle's user is the identity row-level security reads the passkey under.
  const ctx = { workspaceId, userId, role: 'system' } as const
  const passkey = await withWorkspace(ctx, tx => findPasskeyByCredential(tx, workspaceId, response.id), pool)
  if (!passkey) {
    await consume(LIMITS.passkeyFailIp, address, pool)
    return { ok: false, error: 'passkey_unknown', credentialId: response.id }
  }
  if (!(await markChallengeUsed(challenge, pool))) return failed()
  const verified = await verifyAssertion(response, challenge, passkey, config)
  if (!verified) return failed()

  const ipHash = hashIp(meta.ip, config.ipHashKey)
  const signedIn = await withWorkspace(ctx, async tx => {
    await recordPasskeyUse(tx, ctx, passkey.id, verified.newCounter)
    return finishSignIn(tx, { workspaceId, userId, method: 'passkey', userAgent: meta.userAgent, ipHash })
  }, pool)
  return { ok: true, ...signedIn }
}

/** A passkey as the proof of a re-authentication; it must belong to the session's user (spec §5.1). */
export async function reauthenticateWithPasskey(
  session: Session,
  response: AuthenticationResponseJSON,
  cookie: string | undefined,
  meta: Meta,
  overrides: Partial<AuthDeps> = {},
): Promise<({ ok: true } & NewSession) | AuthFailure> {
  const deps = authDeps(overrides)
  const { pool, config } = deps
  const challenge = readChallenge(cookie, 'auth', undefined, config, deps.now())
  if (!challenge || userIdFromHandle(response.response.userHandle) !== session.userId) return { ok: false, error: 'passkey_failed' }
  const ctx = workspaceContext(session)
  const passkey = await withWorkspace(ctx, tx => findPasskeyByCredential(tx, session.workspaceId, response.id), pool)
  if (!passkey || !(await markChallengeUsed(challenge, pool))) return { ok: false, error: 'passkey_failed' }
  const verified = await verifyAssertion(response, challenge, passkey, config)
  if (!verified) return { ok: false, error: 'passkey_failed' }
  const ipHash = hashIp(meta.ip, config.ipHashKey)
  const fresh = await withWorkspace(ctx, async tx => {
    await recordPasskeyUse(tx, session, passkey.id, verified.newCounter)
    const rotated = await rotateSession(tx, session, { userAgentSummary: summariseUserAgent(meta.userAgent), ipHash })
    await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.reauthenticated', details: { method: 'passkey' }, ipHash })
    return rotated
  }, pool)
  return { ok: true, ...fresh }
}

/** Options for a new passkey: the owner workspace only, after a recent authentication (spec §5.1, §5.3). */
export async function beginRegistration(
  session: Session,
  overrides: Partial<AuthDeps> = {},
): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON; cookie: string } | AuthFailure> {
  const deps = authDeps(overrides)
  if (session.workspaceKind !== 'owner') return { ok: false, error: 'generic' }
  if (!isRecentAuth(session, deps.now())) return { ok: false, error: 'reauth_required' }
  const { self, existing } = await withWorkspace(workspaceContext(session), async tx => ({
    self: (await getSelf(tx, session))!,
    existing: await listPasskeys(tx, session),
  }), deps.pool)
  const options = await generateRegistrationOptions({
    rpName: APP_NAME,
    rpID: deps.config.rpId,
    userName: self.email,
    userDisplayName: self.name,
    userID: handleFromUserId(session.userId),
    attestationType: 'none',
    excludeCredentials: existing.map(p => ({ id: p.credentialId, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    timeout: CHALLENGE_TTL_SECONDS * 1000,
  })
  return { ok: true, options, cookie: challengeCookie(options.challenge, 'register', session.id, deps.config, deps.now()) }
}

export async function finishRegistration(
  session: Session,
  response: RegistrationResponseJSON,
  cookie: string | undefined,
  meta: Meta,
  overrides: Partial<AuthDeps> = {},
): Promise<{ ok: true } | AuthFailure> {
  const deps = authDeps(overrides)
  const { pool, config } = deps
  if (session.workspaceKind !== 'owner') return { ok: false, error: 'generic' }
  if (!isRecentAuth(session, deps.now())) return { ok: false, error: 'reauth_required' }
  const challenge = readChallenge(cookie, 'register', session.id, config, deps.now())
  if (!challenge || !(await markChallengeUsed(challenge, pool))) return { ok: false, error: 'passkey_failed' }
  let credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] }
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
    })
    if (!result.verified) return { ok: false, error: 'passkey_failed' }
    credential = result.registrationInfo.credential
  } catch {
    return { ok: false, error: 'passkey_failed' }
  }
  const ipHash = hashIp(meta.ip, config.ipHashKey)
  await withWorkspace(workspaceContext(session), async tx => {
    const id = await addPasskey(tx, session.workspaceId, session.userId, {
      credentialId: credential.id,
      publicKey: encodeBase64urlNoPadding(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      name: (summariseUserAgent(meta.userAgent) ?? 'Passkey').slice(0, 60),
    })
    await deleteOtherOwnSessions(tx, session)
    await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.passkey_added', entityType: 'passkey', entityId: id, ipHash })
  }, pool)
  return { ok: true }
}

export async function renameOwnPasskey(session: Session, passkeyId: string, name: string, overrides: Partial<AuthDeps> = {}): Promise<{ ok: true } | AuthFailure> {
  const deps = authDeps(overrides)
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 60) return { ok: false, error: 'generic' }
  const renamed = await withWorkspace(workspaceContext(session), tx => renamePasskey(tx, session, passkeyId, trimmed), deps.pool)
  return renamed ? { ok: true } : { ok: false, error: 'generic' }
}

/** Never the last second factor (spec §5.3); signs out the owner's other sessions (spec §5.1). */
export async function removeOwnPasskey(session: Session, passkeyId: string, meta: Meta, overrides: Partial<AuthDeps> = {}): Promise<{ ok: true } | AuthFailure> {
  const deps = authDeps(overrides)
  if (session.workspaceKind !== 'owner') return { ok: false, error: 'generic' }
  if (!isRecentAuth(session, deps.now())) return { ok: false, error: 'reauth_required' }
  const ipHash = hashIp(meta.ip, deps.config.ipHashKey)
  return withWorkspace(workspaceContext(session), async (tx): Promise<{ ok: true } | AuthFailure> => {
    await lockSelf(tx, session)
    const self = (await getSelf(tx, session))!
    if ((await countPasskeys(tx, session)) + (self.hasTotp ? 1 : 0) <= 1) return { ok: false, error: 'last_factor' }
    if (!(await deletePasskey(tx, session, passkeyId))) return { ok: false, error: 'generic' }

    await deleteOtherOwnSessions(tx, session)
    await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.passkey_removed', entityType: 'passkey', entityId: passkeyId, ipHash })
    return { ok: true }
  }, deps.pool)
}
