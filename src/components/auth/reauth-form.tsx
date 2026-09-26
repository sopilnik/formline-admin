'use client'

import { startAuthentication } from '@simplewebauthn/browser'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'
import { FormAlert, useErrorText, useFocusOnError } from '@/components/auth/form-parts'
import { passkeyChallenge } from '@/components/auth/passkey-sign-in'
import { TextField } from '@/components/auth/text-field'
import { Button } from '@/components/ui/button'
import { IDLE, type AuthError, type FormState } from '@/lib/auth-form'
import { reauthWithPasskeyAction } from '@/server/actions/passkeys'
import { reauthAction } from '@/server/actions/reauth'
import type { ReauthField } from '@/server/auth/reauth'

/** "Confirm it's you": the password and a code, or a passkey, before a sensitive change (spec §5.1). */
export function ReauthForm() {
  const t = useTranslations('auth')
  const router = useRouter()
  const [state, action, pending] = useActionState(reauthAction, IDLE as FormState<ReauthField>)
  const [passkeyError, setPasskeyError] = useState<AuthError | null>(null)
  const errorFor = useErrorText(state)
  useFocusOnError(state, 'reauth', 'password')

  async function withPasskey() {
    setPasskeyError(null)
    try {
      const outcome = await reauthWithPasskeyAction(await startAuthentication({ optionsJSON: await passkeyChallenge() }))
      if (outcome.ok) router.refresh()
      else setPasskeyError(outcome.error)
    } catch {
      setPasskeyError('passkey_cancelled')
    }
  }

  return (
    <section aria-labelledby="reauth-title" className="rounded-lg border bg-secondary p-4">
      <h2 id="reauth-title" className="text-base font-bold">{t('reauth.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('reauth.intro')}</p>
      <form action={action} noValidate className="mt-4 flex flex-col gap-4">
        <FormAlert state={state} />
        <TextField id="reauth-password" name="password" type="password" autoComplete="current-password" label={t('fields.password')} error={errorFor('password')} />
        <TextField id="reauth-code" name="code" inputMode="numeric" autoComplete="one-time-code" label={t('fields.code')} error={errorFor('code')} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? t('reauth.pending') : t('reauth.submit')}</Button>
          <Button type="button" variant="outline" onClick={withPasskey}>{t('reauth.passkey')}</Button>
        </div>
        {passkeyError ? <p role="alert" className="text-sm text-destructive">{t(`errors.${passkeyError}`, { minutes: 1 })}</p> : null}
      </form>
    </section>
  )
}
