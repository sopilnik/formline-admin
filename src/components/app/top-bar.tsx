import { LanguageMenu } from '@/components/app/language-menu'
import { MobileNav } from '@/components/app/mobile-nav'
import type { NavItem } from '@/components/app/nav'
import { ThemeMenu } from '@/components/app/theme-menu'
import { UserMenu, type FrameUser } from '@/components/app/user-menu'
import type { Locale } from '@/i18n/locale'
import type { Theme } from '@/lib/theme'

// The search button and the bell join in stage 7, together with what they open.
export function TopBar({ items, theme, locale, user }: { items: NavItem[]; theme: Theme; locale: Locale; user: FrameUser }) {
  return (
    <header className="flex items-center gap-2 border-b border-border bg-card px-4 py-3 md:px-6">
      <MobileNav items={items} />
      <span className="flex-1" />
      <ThemeMenu theme={theme} />
      <LanguageMenu locale={locale} />
      <UserMenu user={user} />
    </header>
  )
}
