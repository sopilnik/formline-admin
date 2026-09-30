import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import type { ReactNode } from 'react'
import { AppFrame } from '@/components/app/app-frame'
import { DemoBanner } from '@/components/app/demo-banner'
import { navItems } from '@/components/app/nav'
import { SIDEBAR_COOKIE } from '@/lib/preferences'
import { hoursLeft } from '@/lib/sandbox'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { requireSession, workspaceContext } from '@/server/auth/sessions'
import { countUnread } from '@/server/dal/notifications'
import { ordersToProcess } from '@/server/dal/orders'
import { getSelf, listMembers } from '@/server/dal/users'
import { withWorkspace } from '@/server/db/with-workspace'
import { readerOf } from '@/server/notifications/feed'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const { self, members, toProcess, unread } = await withWorkspace(workspaceContext(session), async tx => ({
    self: await getSelf(tx, session.userId),
    members: session.workspaceKind === 'sandbox' ? await listMembers(tx) : [],
    toProcess: await ordersToProcess(tx, session.workspaceId),
    unread: await countUnread(tx, await readerOf(tx, session)),
  }))
  if (!self) redirect('/sign-in')
  const store = await cookies()
  return (
    <AppFrame
      items={navItems(session.role, session.workspaceKind, { orders: toProcess })}
      collapsed={store.get(SIDEBAR_COOKIE)?.value === 'collapsed'}
      theme={parseTheme(store.get(THEME_COOKIE)?.value)}
      locale={await getLocale()}
      user={{ name: self.name, role: session.role, kind: session.workspaceKind }}
      unread={unread}
      shortcuts={self.shortcutsEnabled}
      banner={session.workspaceKind === 'sandbox' ? <DemoBanner hours={hoursLeft(session.expiresAt)} members={members.filter(m => m.id !== session.userId)} /> : null}
    >
      {children}
    </AppFrame>
  )
}
