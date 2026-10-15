import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { AcceptInvitationForm } from '@/components/team/accept-invitation-form'
import { requireSession } from '@/server/auth/sessions'
import { hashToken, TOKEN_PATTERN } from '@/server/auth/tokens'
import { findInvitation } from '@/server/dal/invitations'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

type Params = { params: Promise<{ token: string }> }

export async function generateMetadata(): Promise<Metadata> {
  // The owner workspace answers the link with "not found": its tab says so too.
  if ((await requireSession()).workspaceKind !== 'sandbox') {
    return { title: (await getTranslations('notFound'))('title') }
  }

  const t = await getTranslations('invite')

  return { title: t('title') }
}

/**
 * The link of an invitation letter. It works from a session in the sandbox that sent it: the invitation is looked up
 * in the caller's own workspace only, and the owner workspace has none.
 */
export default async function InvitePage({ params }: Params) {
  const session = await requireSession()

  if (session.workspaceKind !== 'sandbox') {
    notFound()
  }

  const token = (await params).token
  const invitation = TOKEN_PATTERN.test(token)
    ? await withWorkspace(workspaceContext(session), tx => findInvitation(tx, hashToken(token)))
    : null
  const t = await getTranslations('invite')
  const role = await getTranslations('user.roles')

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      {invitation?.state === 'pending' ? (
        <section aria-labelledby="invite-summary" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
          <p id="invite-summary" className="text-sm break-words">
            {t('summary', { inviter: invitation.inviterName ?? '—', email: invitation.email, role: role(invitation.role) })}
          </p>
          <p className="text-[13px] text-muted-foreground">{t('continue')}</p>
          <AcceptInvitationForm token={token} />
        </section>
      ) : (
        <section className="flex flex-col items-start gap-3 rounded-lg border bg-card p-5">
          <h2 className="font-sans text-base font-semibold">{t('unusable')}</h2>
          <p className="text-[13px] text-muted-foreground">{t(`state.${invitation?.state ?? 'unknown'}`)}</p>
          <Link href="/overview" className="text-[13px] font-medium text-primary hover:underline">{t('toOverview')}</Link>
        </section>
      )}
    </div>
  )
}
