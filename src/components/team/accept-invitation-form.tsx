'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'
import { TextField } from '@/components/auth/text-field'
import { Button } from '@/components/ui/button'
import { MEMBER_NAME_MAX } from '@/lib/team'
import { acceptInvitationAction, type AcceptState } from '@/server/actions/team'

const IDLE: AcceptState = { status: 'idle' }

/** The new member's name, then the visitor continues as them (spec §8.6). */
export function AcceptInvitationForm({ token }: { token: string }) {
  const t = useTranslations('invite')
  const [state, action, pending] = useActionState(acceptInvitationAction, IDLE)
  const error = state.status === 'error' ? state : null
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {error && error.error !== 'name_required' ? (
        <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">{t(`errors.${error.error}`)}</p>
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
