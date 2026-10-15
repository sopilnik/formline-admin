'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef } from 'react'
import { TextField } from '@/components/app/form-fields'
import { FormAlert, UnreachedAlert, useErrorText, useFocusOnError, useFormAction } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { IDLE, type FormState } from '@/lib/auth-form'
import { changePasswordAction } from '@/server/actions/security'

/** The intro: the sandbox has no password, else confirm first unless signed in recently. */
function introKey(available: boolean, recent: boolean): 'sandbox' | 'intro' | 'confirmFirst' {
  if (!available) {
    return 'sandbox'
  }

  return recent ? 'intro' : 'confirmFirst'
}

/**
 * The owner's password. Demo members have none, so a sandbox gets a note; the form shows once the
 * owner has confirmed it is them, and the new password signs the other devices out.
 */
export function PasswordSection({ available, recent }: { available: boolean; recent: boolean }) {
  const t = useTranslations('settings.security.password')
  const fields = useTranslations('auth.fields')
  const toast = useToast()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(changePasswordAction, IDLE as FormState<'password'>, form)
  const errorFor = useErrorText(state)

  useFocusOnError(state, 'new', 'password')

  const settle = useEffectEvent((result: FormState<'password'>) => {
    if (result.status === 'done') toast.success(t('changed'))
  })

  useEffect(() => settle(state), [state])

  return (
    <section aria-labelledby="password-title" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div>
        <h2 id="password-title" className="font-sans text-[15px] font-semibold">{t('title')}</h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted-foreground">{t(introKey(available, recent))}</p>
      </div>
      {available && recent ? (
        <form ref={form} action={action} noValidate className="flex max-w-md flex-col gap-4">
          <UnreachedAlert unreached={unreached} />
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
