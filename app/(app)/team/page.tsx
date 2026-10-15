import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { InvitationActions } from '@/components/team/invitation-actions'
import { InviteForm } from '@/components/team/invite-form'
import { MemberActions } from '@/components/team/member-actions'
import { TeamTable, type MemberView } from '@/components/team/team-table'
import { formatDateTime } from '@/lib/intl'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { titleFor } from '@/server/authz/page-title'
import { listPendingInvitations } from '@/server/dal/invitations'
import { getStoreSettings } from '@/server/dal/settings'
import { listTeam } from '@/server/dal/team'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('team')

  return { title: await titleFor('team.read', t('title')) }
}

/**
 * The team: owners and admins see it. In a sandbox they change roles
 * and deactivate members; in the owner workspace the team is the owner alone, and a note says why.
 */
export default async function TeamPage() {
  const session = await requireSession()

  if (!can(session.role, 'team.read', session.workspaceKind)) {
    notFound()
  }

  const manage = can(session.role, 'team.manage', session.workspaceKind)
  const { members, invitations, timeZone } = await withWorkspace(workspaceContext(session), async tx => ({
    members: await listTeam(tx, session.workspaceId),
    invitations: manage ? await listPendingInvitations(tx, session.workspaceId) : [],
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
  const locale = await getLocale()
  const t = await getTranslations('team')
  const roleName = await getTranslations('user.roles')
  const views: MemberView[] = members.map(member => {
    const self = member.id === session.userId
    const active = member.deactivatedAt === null
    // Nobody changes the owner row or their own.
    const changeable = manage && !self

    return {
      id: member.id, name: member.name, email: member.email, role: member.role, self, twoFactor: member.twoFactor, active,
      lastActive: member.lastActiveAt ? formatDateTime(member.lastActiveAt, locale, timeZone) : null,
      actions: changeable && member.role !== 'owner'
        ? <MemberActions userId={member.id} person={member.name} role={member.role} active={active} />
        : null,
    }
  })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">{t('count', { total: members.length })}</p>
      </div>
      {session.workspaceKind === 'owner' ? <p className="max-w-prose text-[13px] text-ink-2">{t('ownerNote')}</p> : null}
      {manage ? (
        <section aria-labelledby="team-invite" className="flex flex-col gap-3 rounded-lg border bg-card p-5">
          <div>
            <h2 id="team-invite" className="font-sans text-[15px] font-semibold">{t('invite.title')}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{t('invite.intro')}</p>
          </div>
          <InviteForm />
        </section>
      ) : null}
      <section aria-labelledby="team-members" className="@container rounded-lg border bg-card p-2">
        <h2 id="team-members" className="px-3 pt-2 pb-1 font-sans text-[15px] font-semibold">{t('members')}</h2>
        <TeamTable members={views} />
      </section>
      {invitations.length > 0 ? (
        <section aria-labelledby="team-invitations" className="rounded-lg border bg-card p-2">
          <h2 id="team-invitations" className="px-3 pt-2 pb-1 font-sans text-[15px] font-semibold">{t('invitations.title')}</h2>
          <ul aria-labelledby="team-invitations" className="flex flex-col">
            {invitations.map(invitation => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-3 py-3 last:border-b-0">
                <span className="flex min-w-0 flex-col text-[13px]">
                  <span className="font-medium break-all">{invitation.email}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('invitations.line', { role: roleName(invitation.role), sent: formatDateTime(invitation.createdAt, locale, timeZone) })}
                  </span>
                </span>
                <InvitationActions id={invitation.id} email={invitation.email} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
