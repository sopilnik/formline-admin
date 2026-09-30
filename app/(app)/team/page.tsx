import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { MemberActions } from '@/components/team/member-actions'
import { TeamTable, type MemberView } from '@/components/team/team-table'
import { formatDateTime } from '@/lib/intl'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { getStoreSettings } from '@/server/dal/settings'
import { listTeam } from '@/server/dal/team'
import { withWorkspace } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('team')
  return { title: t('title') }
}

/**
 * The team (spec §8.6): owners and admins see it (his decision, 29 September). In a sandbox they change roles
 * and deactivate members; in the owner workspace the team is the owner alone, and a note says why.
 */
export default async function TeamPage() {
  const session = await requireSession()
  if (!can(session.role, 'team.read', session.workspaceKind)) notFound()
  const manage = can(session.role, 'team.manage', session.workspaceKind)
  const { members, timeZone } = await withWorkspace(workspaceContext(session), async tx => ({
    members: await listTeam(tx, session.workspaceId),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
  const locale = await getLocale()
  const t = await getTranslations('team')
  const views: MemberView[] = members.map(member => {
    const self = member.id === session.userId
    const active = member.deactivatedAt === null
    // Nobody changes the owner row or their own (spec §5.5).
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
      <section aria-labelledby="team-members" className="@container rounded-lg border bg-card p-2">
        <h2 id="team-members" className="px-3 pt-2 pb-1 font-sans text-[15px] font-semibold">{t('members')}</h2>
        <TeamTable members={views} />
      </section>
    </div>
  )
}
