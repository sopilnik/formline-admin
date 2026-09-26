'use client'

import { browserSupportsWebAuthnAutofill, sendSignal, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { FingerprintPattern } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AuthError } from '@/lib/auth-form'
import { signInWithPasskeyAction, type PasskeyOutcome } from '@/server/actions/passkeys'

export async function passkeyChallenge(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const response = await fetch('/api/auth/passkey-challenge', { cache: 'no-store' })
  if (!response.ok) throw new Error(`passkey challenge: ${response.status}`)
  return (await response.json()) as PublicKeyCredentialRequestOptionsJSON
}

async function attempt(autofill: boolean): Promise<PasskeyOutcome> {
  const options = await passkeyChallenge()
  const outcome = await signInWithPasskeyAction(await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill }))
  if (!outcome.ok && outcome.error === 'passkey_unknown' && outcome.credentialId) {
    // Lets the password manager hide a passkey this site no longer knows (spec §5.3).
    await sendSignal({ signalName: 'unknownCredential', rpID: options.rpId ?? location.hostname, credentialID: outcome.credentialId }).catch(() => undefined)
  }
  return outcome
}

// A full page load after a sign-in, so the root layout renders the user's language and theme.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional hard navigation, not a client-side route change
const enter = () => window.location.assign('/overview')

/**
 * Passkey-first sign-in (spec §5.3): the browser offers saved passkeys in the
 * email field's autofill (conditional UI), and the button asks for one directly.
 */
export function PasskeySignIn() {
  const t = useTranslations('auth')
  const [error, setError] = useState<AuthError | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let active = true
    browserSupportsWebAuthnAutofill()
      .then(supported => (supported && active ? attempt(true) : null))
      .then(outcome => {
        if (!outcome || !active) return
        if (outcome.ok) enter()
        else setError(outcome.error)
      })
      // Cancelled when the button starts its own request or the page is left.
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  async function onClick() {
    setPending(true)
    setError(null)
    try {
      const outcome = await attempt(false)
      if (outcome.ok) enter()
      else setError(outcome.error)
    } catch {
      setError('passkey_cancelled')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" onClick={onClick} disabled={pending}>
        <FingerprintPattern aria-hidden />
        {pending ? t('signIn.passkeyPending') : t('signIn.passkey')}
      </Button>
      {error ? <p role="alert" className="text-sm text-destructive">{t(`errors.${error}`, { minutes: 1 })}</p> : null}
    </div>
  )
}
