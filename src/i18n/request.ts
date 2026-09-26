import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { LOCALE_COOKIE, parseLocale, TIME_ZONE } from '@/i18n/locale'

// The language lives in a cookie and the user's profile, not in the URL: the
// panel is never indexed (spec §11).
export default getRequestConfig(async () => {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value)
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: TIME_ZONE,
  }
})
