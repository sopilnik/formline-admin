'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import { TextField } from '@/components/app/form-fields'
import { ErrorAlert, UnreachedAlert, useFormAction } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { MEMBER_NAME_MAX } from '@/lib/team'
import { acceptInvitationAction, type AcceptState } from '@/server/actions/team'

const IDLE: AcceptState = { status: 'idle' }

/** The new member's name, then the visitor continues as them. */
export function AcceptInvitationForm({ token }: { token: string }) {
  const t = useTranslations('invite')
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(acceptInvitationAction, IDLE, form)
  const error = state.status === 'error' ? state : null

  useEffect(() => {
    if (state.status === 'error' && state.error === 'name_required') document.getElementById('invite-name')?.focus()
  }, [state])

  return (
    <form ref={form} action={action} noValidate className="flex flex-col gap-4">
      <UnreachedAlert unreached={unreached} />
      <input type="hidden" name="token" value={token} />
      {error && error.error !== 'name_required' ? (
        <ErrorAlert>{t(`errors.${error.error}`)}</ErrorAlert>
      ) : null}
      <TextField
        id="invite-name" name="name" label={t('name')} hint={t('nameHint')} autoComplete="name" maxLength={MEMBER_NAME_MAX} aria-required
        defaultValue={error?.name ?? ''} error={error?.error === 'name_required' ? t('errors.name_required') : undefined}
      />
      <div>
        <Button type="submit" disabled={pending}>{pending ? t('accepting') : t('accept')}</Button>
      </div>
    </form>
  )
}
