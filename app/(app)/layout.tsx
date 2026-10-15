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
import { requireSession } from '@/server/auth/sessions'
import { countUnread } from '@/server/dal/notifications'
import { ordersToProcess } from '@/server/dal/orders'
import { listMembers } from '@/server/dal/users'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { readerOf } from '@/server/notifications/feed'
import { currentSelf } from '@/server/preferences'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  // The member's row is read apart (currentSelf, which the page may read too), at the same time as the frame's counts.
  const [self, { members, toProcess, unread }] = await Promise.all([
    currentSelf(),
    withWorkspace(workspaceContext(session), async tx => ({
      members: session.workspaceKind === 'sandbox' ? await listMembers(tx, session.workspaceId) : [],
      toProcess: await ordersToProcess(tx, session.workspaceId),
      unread: await countUnread(tx, await readerOf(tx, session)),
    })),
  ])

  if (!self) {
    redirect('/sign-in')
  }

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
