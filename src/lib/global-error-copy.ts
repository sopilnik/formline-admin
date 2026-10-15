import { LOCALE_COOKIE } from '@/i18n/locale'
import { parseTheme, THEME_COOKIE, type Theme } from '@/lib/theme'

/**
 * The words of the root error page (app/global-error.tsx). That page replaces the root layout, so next-intl is not there to
 * give them; they repeat the `errors` strings of both dictionaries, and a unit test keeps them equal.
 */
export const GLOBAL_ERROR_COPY = {
  en: { title: 'Something went wrong', body: 'This page could not be loaded. Try again in a moment.', retry: 'Try again' },
  ru: { title: 'Что-то пошло не так', body: 'Не удалось загрузить страницу. Попробуйте ещё раз чуть позже.', retry: 'Повторить' },
} as const

/** The theme the visitor chose in the theme menu, from its cookie (`formline_theme`); System by default. */
export function globalErrorTheme(cookie: string): Theme {
  const chosen = new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([a-z]+)(?:;|$)`).exec(cookie)

  return parseTheme(chosen?.[1])
}

/** The language the visitor chose, from the cookie the panel keeps (`NEXT_LOCALE`); English by default. */
export function globalErrorLocale(cookie: string): keyof typeof GLOBAL_ERROR_COPY {
  return new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=ru(?:;|$)`).test(cookie) ? 'ru' : 'en'
}
