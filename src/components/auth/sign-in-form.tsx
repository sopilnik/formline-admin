'use client'

import { useTranslations } from 'next-intl'
import { useRef } from 'react'
import { TextField } from '@/components/app/form-fields'
import { ErrorAlert, FormAlert, UnreachedAlert, useErrorText, useFocusOnError, useFormAction } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { IDLE, type FormState } from '@/lib/auth-form'
import { signInAction } from '@/server/actions/sign-in'
import type { SignInField } from '@/server/auth/sign-in'

/** The owner's email and password; `expired` says that the sign-in before it took too long. */
export function SignInForm({ expired = false }: { expired?: boolean }) {
  const t = useTranslations('auth')
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(signInAction, IDLE as FormState<SignInField>, form)
  const errorFor = useErrorText(state)
  useFocusOnError(state, 'sign-in', 'email')
  const email = state.status === 'error' ? state.values?.email : undefined
  return (
    <form ref={form} action={action} noValidate className="flex flex-col gap-4">
      <UnreachedAlert unreached={unreached} />
      {expired && state.status === 'idle' ? <ErrorAlert>{t('errors.session_expired')}</ErrorAlert> : null}
      <FormAlert state={state} />
      <TextField
        id="sign-in-email" name="email" type="email" autoComplete="username webauthn" label={t('fields.email')} defaultValue={email} error={errorFor('email')}
      />
      <TextField id="sign-in-password" name="password" type="password" autoComplete="current-password" label={t('fields.password')} error={errorFor('password')} />
      <Button type="submit" disabled={pending}>{pending ? t('signIn.pending') : t('signIn.submit')}</Button>
    </form>
  )
}
