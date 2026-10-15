import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { knownLocale, LANG_LINK_HEADER, LOCALE_COOKIE, type Locale } from '@/i18n/locale'
import { PREFERENCE_COOKIE_OPTIONS } from '@/lib/preference-cookie'
import { THEME_COOKIE, type Theme } from '@/lib/theme'
import { requireSession } from '@/server/auth/sessions'
import { getSelf, updateSelfPreferences, type Self } from '@/server/dal/users'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

/** The server renders the theme class and the language from these cookies (Server Actions only). */
export async function setPreferenceCookies(preferences: { locale?: Locale; theme?: Theme }): Promise<void> {
  const store = await cookies()

  if (preferences.locale) {
    store.set(LOCALE_COOKIE, preferences.locale, PREFERENCE_COOKIE_OPTIONS)
  }
  if (preferences.theme) {
    store.set(THEME_COOKIE, preferences.theme, PREFERENCE_COOKIE_OPTIONS)
  }
}

/**
 * The member's own row for this request, read once for the frame and the page alike. A link opened with ?lang chose the
 * language for the member as well, as the top bar's switch does (proxy.ts marks such a request): it is saved first, so
 * the page, the profile and the letters agree.
 */
export const currentSelf = cache(async (): Promise<Self | null> => {
  const session = await requireSession()
  const linked = knownLocale((await headers()).get(LANG_LINK_HEADER))

  return withWorkspace(workspaceContext(session), async tx => {
    const self = await getSelf(tx, session)

    if (!self || !linked || linked === self.locale) {
      return self
    }

    await updateSelfPreferences(tx, session, { locale: linked })

    return { ...self, locale: linked }
  })
})
