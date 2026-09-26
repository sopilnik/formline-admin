import { INTL_LOCALE, TIME_ZONE, type Locale } from '@/i18n/locale'

/** A calendar date in the interface language and the store's time zone (spec §11). */
export function formatDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE }).format(date)
}
