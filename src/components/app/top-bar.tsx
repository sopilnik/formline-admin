import { LanguageMenu } from '@/components/app/language-menu'
import { MobileNav } from '@/components/app/mobile-nav'
import type { NavItem } from '@/components/app/nav'
import { NotificationBell } from '@/components/app/notification-bell'
import { ThemeMenu } from '@/components/app/theme-menu'
import { UserMenu, type FrameUser } from '@/components/app/user-menu'
import type { Locale } from '@/i18n/locale'
import type { Theme } from '@/lib/theme'

// The search button joins in task 7.3, together with the palette it opens.
export function TopBar({ items, theme, locale, user, unread }: { items: NavItem[]; theme: Theme; locale: Locale; user: FrameUser; unread: number }) {
  return (
    <header className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 md:px-6">
      <MobileNav items={items} />
      <span className="flex-1" />
      <NotificationBell initialUnread={unread} />
      <ThemeMenu theme={theme} />
      <LanguageMenu locale={locale} />
      <UserMenu user={user} />
    </header>
  )
}
