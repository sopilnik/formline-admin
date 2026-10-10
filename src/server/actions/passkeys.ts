'use server'

import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { retryMinutes, type AuthError } from '@/lib/auth-form'
import {
  beginRegistration,
  CHALLENGE_COOKIE,
  CHALLENGE_COOKIE_OPTIONS,
  CHALLENGE_TTL_SECONDS,
  finishRegistration,
  reauthenticateWithPasskey,
  removeOwnPasskey,
  renameOwnPasskey,
  signInWithPasskey,
} from '@/server/auth/passkeys'
import { requireSession, setSessionCookie, type Session } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { setPreferenceCookies } from '@/server/preferences'
import { getClientIp } from '@/server/request'

// The browser's WebAuthn JSON. Unknown keys are dropped, not refused, so a browser
// adding a field does not break sign-in; nothing unknown reaches the verifier.
// The panel requests no extensions, so client extension results are ignored.
const credential = {
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal('public-key'),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
}
const authenticationResponse = z.object({
  ...credential,
  response: z.object({
    clientDataJSON: z.string().max(8192),
    authenticatorData: z.string().max(8192),
    // Room for post-quantum signatures: the library offers ML-DSA-44 first where the runtime supports it (2 420 bytes), and
    // ML-DSA-87 signs with 4 627 bytes, 6 170 characters in base64url.
    signature: z.string().max(8192),
    userHandle: z.string().max(128).optional(),
  }),
})
const registrationResponse = z.object({
  ...credential,
  response: z.object({
    clientDataJSON: z.string().max(8192),
    attestationObject: z.string().max(16384),
    authenticatorData: z.string().max(8192).optional(),
    transports: z.array(z.string().max(32)).max(8).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: z.string().max(4096).optional(),
  }),
})

export type PasskeyOutcome = { ok: true } | { ok: false; error: AuthError; credentialId?: string; retryAfterMinutes?: number }

async function meta() {
  return { ip: await getClientIp(), userAgent: (await headers()).get('user-agent') }
}

/** Reads the challenge cookie once and clears it, whatever happens next. */
async function takeChallengeCookie(): Promise<string | undefined> {
  const store = await cookies()
  const value = store.get(CHALLENGE_COOKIE)?.value
  store.set(CHALLENGE_COOKIE, '', { ...CHALLENGE_COOKIE_OPTIONS, maxAge: 0 })
  return value
}

function selfManage(session: Session): void {
  authorize({ role: session.role, workspaceKind: session.workspaceKind }, 'self.manage')
}

/** The client navigates on success: the root layout must render the new language and theme. */
export async function signInWithPasskeyAction(input: unknown): Promise<PasskeyOutcome> {
  const cookie = await takeChallengeCookie()
  const parsed = authenticationResponse.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'passkey_failed' }
  const response: AuthenticationResponseJSON = { ...parsed.data, clientExtensionResults: {} }
  const result = await signInWithPasskey(response, cookie, await meta())
  if (!result.ok) {
    return { ok: false, error: result.error, credentialId: 'credentialId' in result ? result.credentialId : undefined, retryAfterMinutes: 'retryAfterSeconds' in result ? retryMinutes(result.retryAfterSeconds) : undefined }
  }
  await setSessionCookie(result.token, result.expiresAt)
  await setPreferenceCookies({ locale: result.locale, theme: result.theme })
  return { ok: true }
}

export async function reauthWithPasskeyAction(input: unknown): Promise<PasskeyOutcome> {
  const session = await requireSession()
  const cookie = await takeChallengeCookie()
  const parsed = authenticationResponse.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'passkey_failed' }
  const result = await reauthenticateWithPasskey(session, { ...parsed.data, clientExtensionResults: {} }, cookie, await meta())
  if (!result.ok) return { ok: false, error: result.error }
  await setSessionCookie(result.token, result.expiresAt)
  return { ok: true }
}

export async function beginPasskeyRegistrationAction(): Promise<{ ok: true; options: PublicKeyCredentialCreationOptionsJSON } | { ok: false; error: AuthError }> {
  const session = await requireSession()
  selfManage(session)
  const result = await beginRegistration(session)
  if (!result.ok) return { ok: false, error: result.error }
  const store = await cookies()
  store.set(CHALLENGE_COOKIE, result.cookie, { ...CHALLENGE_COOKIE_OPTIONS, maxAge: CHALLENGE_TTL_SECONDS })
  return { ok: true, options: result.options }
}

export async function finishPasskeyRegistrationAction(input: unknown): Promise<PasskeyOutcome> {
  const session = await requireSession()
  selfManage(session)
  const cookie = await takeChallengeCookie()
  const parsed = registrationResponse.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'passkey_failed' }
  const response: RegistrationResponseJSON = { ...parsed.data, clientExtensionResults: {} }
  const result = await finishRegistration(session, response, cookie, await meta())
  revalidatePath('/settings/security')
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function renamePasskeyAction(id: string, name: string): Promise<PasskeyOutcome> {
  const session = await requireSession()
  selfManage(session)
  const passkeyId = z.uuid().safeParse(id)
  if (!passkeyId.success) return { ok: false, error: 'generic' }
  const result = await renameOwnPasskey(session, passkeyId.data, z.string().max(200).catch('').parse(name))
  revalidatePath('/settings/security')
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function removePasskeyAction(id: string): Promise<PasskeyOutcome> {
  const session = await requireSession()
  selfManage(session)
  const passkeyId = z.uuid().safeParse(id)
  if (!passkeyId.success) return { ok: false, error: 'generic' }
  const result = await removeOwnPasskey(session, passkeyId.data, await meta())
  revalidatePath('/settings/security')
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}
