import { cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import type { ReactNode } from 'react'
import { LanguageMenu } from '@/components/app/language-menu'
import { ThemeMenu } from '@/components/app/theme-menu'
import { StoreBlock } from '@/components/auth/store-block'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'

// Sign-in, setup and recovery: no session is needed and none is looked up here, so
// the sign-in page never wakes the database.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <StoreBlock />
        <div className="flex items-center gap-1">
          <ThemeMenu theme={theme} />
          <LanguageMenu locale={await getLocale()} />
        </div>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pt-4 pb-16 sm:pt-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
