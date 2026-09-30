'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent } from 'react'
import { FormAlert, useErrorText, useFocusOnError } from '@/components/auth/form-parts'
import { TextField } from '@/components/auth/text-field'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { IDLE, type FormState } from '@/lib/auth-form'
import { changePasswordAction } from '@/server/actions/security'

/**
 * The owner's password (spec §5.1, §8.8). Demo members have none, so a sandbox gets a note; the form shows once the
 * owner has confirmed it is them, and the new password signs the other devices out.
 */
export function PasswordSection({ available, recent }: { available: boolean; recent: boolean }) {
  const t = useTranslations('settings.security.password')
  const fields = useTranslations('auth.fields')
  const toast = useToast()
  const [state, action, pending] = useActionState(changePasswordAction, IDLE as FormState<'password'>)
  const errorFor = useErrorText(state)
  useFocusOnError(state, 'new', 'password')
  const settle = useEffectEvent((result: FormState<'password'>) => {
    if (result.status === 'done') toast.success(t('changed'))
  })
  useEffect(() => settle(state), [state])
  return (
    <section aria-labelledby="password-title" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div>
        <h2 id="password-title" className="text-base font-bold">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{available ? (recent ? t('intro') : t('confirmFirst')) : t('sandbox')}</p>
      </div>
      {available && recent ? (
        <form action={action} noValidate className="flex max-w-md flex-col gap-4">
          <FormAlert state={state} />
          <TextField
            id="new-password" name="password" type="password" autoComplete="new-password" label={fields('newPassword')} hint={fields('passwordHint')}
            error={errorFor('password')}
          />
          <div>
            <Button type="submit" disabled={pending}>{pending ? t('changing') : t('change')}</Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
