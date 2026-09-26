'use client'

import { useTranslations } from 'next-intl'
import { useActionState, type ReactNode } from 'react'
import { FormAlert, useErrorText, useFocusOnError } from '@/components/auth/form-parts'
import { RecoveryCodesView } from '@/components/auth/recovery-codes-view'
import { TextField } from '@/components/auth/text-field'
import { TotpEnrolment } from '@/components/auth/totp-enrolment'
import { Button } from '@/components/ui/button'
import { IDLE, type FormState } from '@/lib/auth-form'
import { recoverAction } from '@/server/actions/recover'
import type { RecoverField } from '@/server/auth/recovery'

export function RecoverForm({ secret, qr }: { secret: string; qr: ReactNode }) {
  const t = useTranslations('auth')
  const [state, action, pending] = useActionState(recoverAction, IDLE as FormState<RecoverField>)
  const errorFor = useErrorText(state)
  useFocusOnError(state, 'recover', 'recoveryCode')
  if (state.status === 'done') return <RecoveryCodesView codes={state.recoveryCodes ?? []} />
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <FormAlert state={state} />
      <TextField id="recover-recoveryCode" name="recoveryCode" autoComplete="off" label={t('recover.code')} error={errorFor('recoveryCode')} />
      <TextField id="recover-password" name="password" type="password" autoComplete="new-password" label={t('fields.newPassword')} hint={t('fields.passwordHint')} error={errorFor('password')} />
      <TotpEnrolment id="recover-code" secret={secret} qr={qr} error={errorFor('code')} />
      <Button type="submit" disabled={pending}>{pending ? t('recover.pending') : t('recover.submit')}</Button>
    </form>
  )
}
