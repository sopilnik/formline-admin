export const LOCALES = ['en', 'ru'] as const
export type Locale = (typeof LOCALES)[number]

/** next-intl's cookie name; proxy.ts sets it from ?lang. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/** The request header proxy.ts forwards with the language a ?lang link chose, so the frame saves it to the member too. */
export const LANG_LINK_HEADER = 'x-lang-link'

/** Intl locales: English in the British style ("24 Sept, 14:02", "$14,286"), Russian as is. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', ru: 'ru-RU' }

/** The time zone of a store whose settings name none, and of next-intl's request config; pages pass the store's own zone. */
export const TIME_ZONE = 'Europe/Berlin'

export function parseLocale(value: string | null | undefined): Locale {
  return value === 'ru' ? 'ru' : 'en'
}

/** One of the languages, or null for anything else. */
export function knownLocale(value: string | null | undefined): Locale | null {
  return value === 'en' || value === 'ru' ? value : null
}
