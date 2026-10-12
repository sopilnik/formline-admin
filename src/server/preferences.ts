import 'server-only'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, type Locale } from '@/i18n/locale'
import { PREFERENCE_COOKIE_OPTIONS } from '@/lib/preference-cookie'
import { THEME_COOKIE, type Theme } from '@/lib/theme'

/** The server renders the theme class and the language from these cookies (Server Actions only). */
export async function setPreferenceCookies(preferences: { locale?: Locale; theme?: Theme }): Promise<void> {
  const store = await cookies()
  if (preferences.locale) store.set(LOCALE_COOKIE, preferences.locale, PREFERENCE_COOKIE_OPTIONS)
  if (preferences.theme) store.set(THEME_COOKIE, preferences.theme, PREFERENCE_COOKIE_OPTIONS)
}
