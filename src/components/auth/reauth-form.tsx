'use client'

import { startAuthentication } from '@simplewebauthn/browser'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { TextField } from '@/components/app/form-fields'
import { FormAlert, UnreachedAlert, useErrorText, useFocusOnError, useFormAction } from '@/components/app/form-parts'
import { useReach } from '@/components/app/use-reach'
import { Button } from '@/components/ui/button'
import { IDLE, type AuthError, type FormState } from '@/lib/auth-form'
import { passkeyChallenge } from '@/lib/passkeys'
import { reauthWithPasskeyAction } from '@/server/actions/passkeys'
import { reauthAction } from '@/server/actions/reauth'
import type { ReauthField } from '@/server/auth/reauth'

/** "Confirm it's you": the password and a code, or a passkey, before a sensitive change. */
export function ReauthForm({ intro }: { intro?: string } = {}) {
  const t = useTranslations('auth')
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(reauthAction, IDLE as FormState<ReauthField>, form)
  const [passkeyError, setPasskeyError] = useState<AuthError | null>(null)
  const [passkeyPending, setPasskeyPending] = useState(false)
  const errorFor = useErrorText(state)
  const send = useReach()
  useFocusOnError(state, 'reauth', 'password')

  async function withPasskey() {
    setPasskeyError(null)
    setPasskeyPending(true)
    try {
      const answer = await startAuthentication({ optionsJSON: await passkeyChallenge() })
      const outcome = await send(() => reauthWithPasskeyAction(answer))
      if (!outcome) return
      if (outcome.ok) router.refresh()
      else setPasskeyError(outcome.error)
    } catch {
      setPasskeyError('passkey_cancelled')
    } finally {
      setPasskeyPending(false)
    }
  }

  return (
    <section aria-labelledby="reauth-title" className="rounded-lg border bg-secondary p-4">
      <h2 id="reauth-title" className="font-sans text-[15px] font-semibold">{t('reauth.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{intro ?? t('reauth.intro')}</p>
      <form ref={form} action={action} noValidate className="mt-4 flex flex-col gap-4">
        <UnreachedAlert unreached={unreached} />
        <FormAlert state={state} />
        <TextField id="reauth-password" name="password" type="password" autoComplete="current-password" label={t('fields.password')} error={errorFor('password')} />
        <TextField id="reauth-code" name="code" inputMode="numeric" autoComplete="one-time-code" label={t('fields.code')} error={errorFor('code')} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? t('reauth.pending') : t('reauth.submit')}</Button>
          <Button type="button" variant="outline" onClick={withPasskey} disabled={passkeyPending}>
            {passkeyPending ? t('signIn.passkeyPending') : t('reauth.passkey')}
          </Button>
        </div>
        {passkeyError ? <p role="alert" className="text-sm text-destructive">{t(`errors.${passkeyError}`, { minutes: 1 })}</p> : null}
      </form>
    </section>
  )
}
