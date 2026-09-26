export const LOCALES = ['en', 'ru'] as const
export type Locale = (typeof LOCALES)[number]

/** next-intl's cookie name; proxy.ts sets it from ?lang (spec §11). */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/** Intl locales (spec §11): English in the British style ("24 Sep, 14:02", "$14,286"), Russian as is. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ru: 'ru-RU' }

/** The store's default time zone; stage 4 reads it from the store settings. */
export const TIME_ZONE = 'Europe/Berlin'

export function parseLocale(value: string | null | undefined): Locale {
  return value === 'ru' ? 'ru' : 'en'
}
