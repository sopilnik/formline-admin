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
import { getSelf } from '@/server/dal/users'
import { withWorkspace } from '@/server/db/with-workspace'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession()
  const self = await withWorkspace(workspaceContext(session), tx => getSelf(tx, session.userId))
  if (!self) redirect('/sign-in')
  const store = await cookies()
  return (
    <AppFrame
      items={navItems(session.role, session.workspaceKind)}
      collapsed={store.get(SIDEBAR_COOKIE)?.value === 'collapsed'}
      theme={parseTheme(store.get(THEME_COOKIE)?.value)}
      locale={await getLocale()}
      user={{ name: self.name, role: session.role, kind: session.workspaceKind }}
      banner={session.workspaceKind === 'sandbox' ? <DemoBanner hours={hoursLeft(session.expiresAt)} /> : null}
    >
      {children}
    </AppFrame>
  )
}
