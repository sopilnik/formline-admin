'use client'

import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { resendInvitationAction, revokeInvitationAction } from '@/server/actions/team'

/** "Resend" writes the same link into a new letter; "Revoke" stops the link (spec §8.6). */
export function InvitationActions({ id, email }: { id: string; email: string }) {
  const t = useTranslations('team.invitations')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const run = (kind: 'resend' | 'revoke'): void => startTransition(async () => {
    const result = kind === 'resend' ? await resendInvitationAction({ id }) : await revokeInvitationAction({ id })
    if (result.ok) toast.success(t(kind === 'resend' ? 'resent' : 'revoked', { email }))
    else toast.error(t('failed'))
  })
  return (
    <span className="flex shrink-0 gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={t('resendLabel', { email })} onClick={() => run('resend')}>{t('resend')}</Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} aria-label={t('revokeLabel', { email })} onClick={() => run('revoke')}>{t('revoke')}</Button>
    </span>
  )
}
