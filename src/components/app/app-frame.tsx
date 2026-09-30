import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import type { NavItem } from '@/components/app/nav'
import { ShortcutsProvider } from '@/components/app/shortcuts'
import { Sidebar } from '@/components/app/sidebar'
import { TopBar } from '@/components/app/top-bar'
import type { FrameUser } from '@/components/app/user-menu'
import type { Locale } from '@/i18n/locale'
import type { Theme } from '@/lib/theme'

type Props = {
  items: NavItem[]; collapsed: boolean; theme: Theme; locale: Locale; user: FrameUser; unread: number; shortcuts: boolean
  banner?: ReactNode; children: ReactNode
}

export async function AppFrame({ items, collapsed, theme, locale, user, unread, shortcuts, banner, children }: Props) {
  const t = await getTranslations('common')
  return (
    <ShortcutsProvider enabled={shortcuts} items={items}>
      <div className="flex min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:font-medium focus:text-foreground"
        >
          {t('skipToContent')}
        </a>
        <Sidebar items={items} collapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar items={items} theme={theme} locale={locale} user={user} unread={unread} />
          {banner}
          <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-8 md:py-7">
            {children}
          </main>
        </div>
      </div>
    </ShortcutsProvider>
  )
}
