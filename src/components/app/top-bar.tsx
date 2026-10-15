import { CommandPalette } from '@/components/app/command-palette'
import { LanguageMenu } from '@/components/app/language-menu'
import { MobileNav } from '@/components/app/mobile-nav'
import type { NavItem } from '@/components/app/nav'
import { NotificationBell } from '@/components/app/notification-bell'
import { SignOutProvider } from '@/components/app/sign-out'
import { ThemeMenu } from '@/components/app/theme-menu'
import { UserMenu, type FrameUser } from '@/components/app/user-menu'
import type { Locale } from '@/i18n/locale'
import type { Theme } from '@/lib/theme'
import { can } from '@/server/authz/matrix'

export function TopBar({ items, theme, locale, user, unread }: { items: NavItem[]; theme: Theme; locale: Locale; user: FrameUser; unread: number }) {
  const access = { newProduct: can(user.role, 'catalog.write', user.kind), invite: can(user.role, 'team.manage', user.kind) }

  return (
    <header className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 md:px-6">
      <SignOutProvider kind={user.kind}>
        <MobileNav items={items} />
        <CommandPalette items={items} access={access} />
        <span className="flex-1" />
        <NotificationBell initialUnread={unread} />
        <ThemeMenu theme={theme} />
        <LanguageMenu locale={locale} />
        <UserMenu user={user} />
      </SignOutProvider>
    </header>
  )
}
