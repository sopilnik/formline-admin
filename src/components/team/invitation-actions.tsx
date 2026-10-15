'use client'

import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { useReach, useRoleRefusal } from '@/components/app/use-reach'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { resendInvitationAction, revokeInvitationAction } from '@/server/actions/team'

/** "Resend" writes the same link into a new letter; "Revoke" stops the link. */
export function InvitationActions({ id, email }: { id: string; email: string }) {
  const t = useTranslations('team.invitations')
  const toast = useToast()
  const send = useReach()
  const refused = useRoleRefusal()
  const invite = useTranslations('team.invite.errors')
  const [pending, startTransition] = useTransition()
  const run = (kind: 'resend' | 'revoke'): void => startTransition(async () => {
    const result = await send(() => (kind === 'resend' ? resendInvitationAction({ id }) : revokeInvitationAction({ id })))

    if (!result) {
      return
    }

    if (result.ok) {
      toast.success(t(kind === 'resend' ? 'resent' : 'revoked', { email }))
    } else if (result.code === 'forbidden') {
      refused(invite('forbidden'))
    } else {
      toast.error(t('failed'))
    }
  })

  return (
    <span className="flex shrink-0 gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={t('resendLabel', { email })} onClick={() => run('resend')}>{t('resend')}</Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={t('revokeLabel', { email })} onClick={() => run('revoke')}>{t('revoke')}</Button>
    </span>
  )
}
