/**
 * The language and theme cookies. Not httpOnly: the root error page replaces the root layout and reads them in the
 * browser, and their values are a language and a theme, nothing secret. One set of options for every writer.
 */
export const PREFERENCE_COOKIE_OPTIONS = { path: '/', sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 365 } as const
