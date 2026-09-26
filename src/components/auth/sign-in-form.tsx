'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { FormAlert, useFocusOnError } from '@/components/auth/form-parts'
import { TextField } from '@/components/auth/text-field'
import { Button } from '@/components/ui/button'
import { IDLE, type FormState } from '@/lib/auth-form'
import { signInAction } from '@/server/actions/sign-in'

export function SignInForm() {
  const t = useTranslations('auth')
  const [state, action, pending] = useActionState(signInAction, IDLE as FormState<'email'>)
  useFocusOnError(state, 'sign-in', 'email')
  const email = state.status === 'error' ? state.values?.email : undefined
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormAlert state={state} />
      <TextField id="sign-in-email" name="email" type="email" autoComplete="username webauthn" label={t('fields.email')} defaultValue={email} />
      <TextField id="sign-in-password" name="password" type="password" autoComplete="current-password" label={t('fields.password')} />
      <Button type="submit" disabled={pending}>{pending ? t('signIn.pending') : t('signIn.submit')}</Button>
    </form>
  )
}
