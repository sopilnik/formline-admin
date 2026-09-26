import 'server-only'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, type Locale } from '@/i18n/locale'
import { THEME_COOKIE, type Theme } from '@/lib/theme'

const YEAR = 60 * 60 * 24 * 365

/** The server renders the theme class and the language from these cookies (Server Actions only). */
export async function setPreferenceCookies(preferences: { locale?: Locale; theme?: Theme }): Promise<void> {
  const store = await cookies()
  const options = { path: '/', sameSite: 'lax' as const, secure: true, httpOnly: true, maxAge: YEAR }
  if (preferences.locale) store.set(LOCALE_COOKIE, preferences.locale, options)
  if (preferences.theme) store.set(THEME_COOKIE, preferences.theme, options)
}
