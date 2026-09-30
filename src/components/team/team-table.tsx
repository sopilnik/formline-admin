import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { Role } from '@/server/db/with-workspace'

/** One member as the table receives it: strings formatted on the server; `actions` is null where nothing may change. */
export type MemberView = {
  id: string; name: string; email: string; role: Role; self: boolean; twoFactor: boolean; active: boolean
  lastActive: string | null
  actions: ReactNode
}

const TH = 'h-10 border-b bg-card px-3 text-left font-medium whitespace-nowrap text-muted-foreground'
const TD = 'border-b px-3 py-2.5 group-last/row:border-b-0'

function Pill({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'off' }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tone === 'off' ? 'bg-badge-cancelled text-status-grey' : 'bg-muted text-ink-2')}>
      {children}
    </span>
  )
}

/**
 * The members (spec §8.6) as a table while the list is at least 56 rem wide, as cards below — the container
 * query of the other lists. A deactivated member is marked and keeps only "Reactivate".
 */
export function TeamTable({ members }: { members: MemberView[] }) {
  const t = useTranslations('team')
  const role = useTranslations('user.roles')
  const name = (member: MemberView) => (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="font-medium break-words">{member.name}</span>
      {member.self ? <Pill>{t('you')}</Pill> : null}
      {member.active ? null : <Pill tone="off">{t('status.deactivated')}</Pill>}
    </span>
  )
  return (
    <>
      <table aria-label={t('members')} className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] @4xl:table">
        <colgroup>
          <col />
          <col className="w-36" />
          <col className="w-36" />
          <col className="w-44" />
          <col className="w-14" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH}>{t('columns.member')}</th>
            <th scope="col" className={TH}>{t('columns.role')}</th>
            <th scope="col" className={TH}>{t('columns.twoFactor')}</th>
            <th scope="col" className={TH}>{t('columns.lastActive')}</th>
            <th scope="col" className={cn(TH, 'relative')}><span className="sr-only">{t('columns.actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {members.map(member => (
            <tr key={member.id} className={cn('group/row', !member.active && 'text-muted-foreground')}>
              <td className={TD}>
                {name(member)}
                <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
              </td>
              <td className={TD}>{role(member.role)}</td>
              <td className={TD}>{member.twoFactor ? t('twoFactorOn') : t('twoFactorOff')}</td>
              <td className={cn(TD, 'tabular-nums')}>{member.lastActive ?? t('noActivity')}</td>
              <td className={cn(TD, 'text-right')}>{member.actions}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={t('members')} className="flex flex-col @4xl:hidden">
        {members.map(member => (
          <li key={member.id} className={cn('flex items-start gap-3 border-b px-3 py-3 last:border-b-0', !member.active && 'text-muted-foreground')}>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
              {name(member)}
              <span className="text-xs break-all text-muted-foreground">{member.email}</span>
              <span className="text-xs text-muted-foreground">
                {`${role(member.role)} · ${member.twoFactor ? t('cardTwoFactorOn') : t('cardTwoFactorOff')}`}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {member.lastActive ? t('cardLastActive', { at: member.lastActive }) : t('noActivity')}
              </span>
            </div>
            {member.actions}
          </li>
        ))}
      </ul>
    </>
  )
}
