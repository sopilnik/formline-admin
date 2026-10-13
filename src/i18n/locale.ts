export const LOCALES = ['en', 'ru'] as const
export type Locale = (typeof LOCALES)[number]

/** next-intl's cookie name; proxy.ts sets it from ?lang. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/** Intl locales: English in the British style ("24 Sept, 14:02", "$14,286"), Russian as is. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ru: 'ru-RU' }

/** The time zone of a store whose settings name none, and of next-intl's request config; pages pass the store's own zone. */
export const TIME_ZONE = 'Europe/Berlin'

export function parseLocale(value: string | null | undefined): Locale {
  return value === 'ru' ? 'ru' : 'en'
}
