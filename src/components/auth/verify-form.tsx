'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { TextField } from '@/components/app/form-fields'
import { FormAlert, UnreachedAlert, useErrorText, useFocusOnError, useFormAction } from '@/components/app/form-parts'
import { Button, buttonVariants } from '@/components/ui/button'
import { IDLE, type FormState } from '@/lib/auth-form'
import { verifyAction } from '@/server/actions/sign-in'

export function VerifyForm({ hasTotp }: { hasTotp: boolean }) {
  const t = useTranslations('auth')
  const [recovery, setRecovery] = useState(!hasTotp)
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(verifyAction, IDLE as FormState<'code'>, form)
  // A switch to the other kind of code starts its empty field clean: the error of the last code stays behind.
  const [left, setLeft] = useState<FormState<'code'> | null>(null)
  const shown = state === left ? IDLE : state
  const errorFor = useErrorText(shown)

  useFocusOnError(shown, 'verify', 'code')

  const switchKind = (): void => {
    setRecovery(!recovery)
    setLeft(state)
  }

  if (state.status === 'error' && state.error === 'second_factor_locked') {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert state={state} />
        <Link href="/sign-in" className={buttonVariants({ variant: 'outline' })}>{t('verify.startOver')}</Link>
      </div>
    )
  }

  const intro = recovery ? (hasTotp ? t('verify.introRecovery') : t('verify.noTotp')) : t('verify.intro')

  return (
    <form ref={form} action={action} noValidate className="flex flex-col gap-4">
      <UnreachedAlert unreached={unreached} />
      <p className="text-sm text-muted-foreground">{intro}</p>
      <FormAlert state={shown} />
      <TextField
        key={recovery ? 'recovery' : 'totp'}
        id="verify-code"
        name="code"
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete={recovery ? 'off' : 'one-time-code'}
        label={recovery ? t('fields.recoveryCode') : t('fields.code')}
        labelInside
        error={errorFor('code')}
      />
      <Button type="submit" disabled={pending}>{pending ? t('verify.pending') : t('verify.submit')}</Button>
      {hasTotp ? (
        <button type="button" onClick={switchKind} className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
          {recovery ? t('verify.useTotp') : t('verify.useRecovery')}
        </button>
      ) : null}
      <Link href="/sign-in" className="self-start text-sm text-muted-foreground underline underline-offset-4">{t('verify.startOver')}</Link>
    </form>
  )
}
