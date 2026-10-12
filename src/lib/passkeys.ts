import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'

/** The longest passkey name: the rename field, the server's check and the name a new passkey takes from its browser. */
export const PASSKEY_NAME_MAX = 60

/** A fresh challenge for a passkey sign-in or re-authentication, from the server that will check the answer. */
export async function passkeyChallenge(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const response = await fetch('/api/auth/passkey-challenge', { cache: 'no-store' })
  if (!response.ok) throw new Error(`passkey challenge: ${response.status}`)
  return (await response.json()) as PublicKeyCredentialRequestOptionsJSON
}
