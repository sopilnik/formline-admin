'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef } from 'react'
import { SelectField, TextField } from '@/components/app/form-fields'
import { UnreachedAlert, useFormAction, useLeaveGuard } from '@/components/app/form-parts'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { ASSIGNABLE_ROLES, EMAIL_MAX } from '@/lib/team'
import { inviteMemberAction, type InviteState } from '@/server/actions/team'

const IDLE: InviteState = { status: 'idle' }

/** "Invite a member": an email and a role; the letter with the link goes to the outbox. */
export function InviteForm() {
  const t = useTranslations('team.invite')
  const role = useTranslations('user.roles')
  const toast = useToast()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending, unreached] = useFormAction(inviteMemberAction, IDLE, form)
  useLeaveGuard(form)
  const settle = useEffectEvent((result: InviteState) => {
    if (result.status === 'done') toast.success(t('sent', { email: result.email }))
    if (result.status === 'error') form.current?.querySelector<HTMLElement>('[name="email"]')?.focus()
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? state : null
  return (
    <form ref={form} action={action} noValidate className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_auto] lg:items-start">
      <UnreachedAlert unreached={unreached} className="lg:col-span-full" />
      <TextField
        id="invite-email" name="email" type="email" label={t('email')} autoComplete="off" maxLength={EMAIL_MAX} aria-required
        defaultValue={error?.values.email ?? ''} error={error ? t(`errors.${error.error}`) : undefined}
      />
      <SelectField id="invite-role" name="role" label={t('role')} defaultValue={error?.values.role ?? 'manager'}>
        {ASSIGNABLE_ROLES.map(option => <option key={option} value={option}>{role(option)}</option>)}
      </SelectField>
      <Button type="submit" disabled={pending} className="lg:mt-5">{pending ? t('sending') : t('submit')}</Button>
    </form>
  )
}
