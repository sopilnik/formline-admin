'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useRef, type ReactNode } from 'react'
import { TextField } from '@/components/app/form-fields'
import { FormAlert, UnreachedAlert, useErrorText, useFocusOnError, useFormAction } from '@/components/app/form-parts'
import { RecoveryCodesView } from '@/components/auth/recovery-codes-view'
import { TotpEnrollment } from '@/components/auth/totp-enrollment'
import { Button, buttonVariants } from '@/components/ui/button'
import { IDLE, type FormState } from '@/lib/auth-form'
import { setupAction } from '@/server/actions/setup'
import type { SetupField } from '@/server/auth/setup'

export function SetupForm({ completed, secret, qr }: { completed: boolean; secret: string; qr: ReactNode }) {
  const t = useTranslations('auth')
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(setupAction, IDLE as FormState<SetupField>, form)
  const errorFor = useErrorText(state)

  useFocusOnError(state, 'setup', 'token')
  if (state.status === 'done') return <RecoveryCodesView codes={state.recoveryCodes ?? []} />
  if (completed) {
    return (
      <div className="flex flex-col gap-4">
        <p>{t('setup.completed')}</p>
        <Link href="/overview" className={buttonVariants()}>{t('setup.continue')}</Link>
      </div>
    )
  }

  const values = state.status === 'error' ? state.values ?? {} : {}

  return (
    <form ref={form} action={action} noValidate className="flex flex-col gap-4">
      <UnreachedAlert unreached={unreached} />
      <FormAlert state={state} />
      <TextField id="setup-token" name="token" type="password" autoComplete="off" label={t('setup.token')} hint={t('setup.tokenHint')} error={errorFor('token')} />
      <TextField id="setup-name" name="name" autoComplete="name" label={t('fields.name')} defaultValue={values.name} error={errorFor('name')} />
      <TextField id="setup-email" name="email" type="email" autoComplete="username" label={t('fields.email')} defaultValue={values.email} error={errorFor('email')} />
      <TextField id="setup-password" name="password" type="password" autoComplete="new-password" label={t('fields.password')} hint={t('fields.passwordHint')} error={errorFor('password')} />
      <TotpEnrollment id="setup-code" secret={secret} qr={qr} error={errorFor('code')} />
      <Button type="submit" disabled={pending}>{pending ? t('setup.pending') : t('setup.submit')}</Button>
    </form>
  )
}
