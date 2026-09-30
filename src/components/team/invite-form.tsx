'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useEffect, useEffectEvent, useRef } from 'react'
import { SelectField } from '@/components/app/form-fields'
import { TextField } from '@/components/auth/text-field'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { ASSIGNABLE_ROLES, EMAIL_MAX } from '@/lib/team'
import { inviteMemberAction, type InviteState } from '@/server/actions/team'

const IDLE: InviteState = { status: 'idle' }

/** "Invite a member" (spec §8.6): an email and a role; the letter with the link goes to the outbox. */
export function InviteForm() {
  const t = useTranslations('team.invite')
  const role = useTranslations('user.roles')
  const toast = useToast()
  const form = useRef<HTMLFormElement>(null)
  const [state, action, pending] = useActionState(inviteMemberAction, IDLE)
  const settle = useEffectEvent((result: InviteState) => {
    if (result.status === 'done') toast.success(t('sent', { email: result.email }))
    if (result.status === 'error') form.current?.querySelector<HTMLElement>('[name="email"]')?.focus()
  })
  useEffect(() => settle(state), [state])
  const error = state.status === 'error' ? state : null
  return (
    <form ref={form} action={action} noValidate className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-start">
      <TextField
        id="invite-email" name="email" type="email" label={t('email')} autoComplete="off" maxLength={EMAIL_MAX} aria-required
        defaultValue={error?.values.email ?? ''} error={error ? t(`errors.${error.error}`) : undefined}
      />
      <SelectField id="invite-role" name="role" label={t('role')} defaultValue={error?.values.role ?? 'manager'}>
        {ASSIGNABLE_ROLES.map(option => <option key={option} value={option}>{role(option)}</option>)}
      </SelectField>
      <Button type="submit" disabled={pending} className="md:mt-[22px]">{pending ? t('sending') : t('submit')}</Button>
    </form>
  )
}
