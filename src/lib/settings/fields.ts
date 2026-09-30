// The fields and limits the settings forms share with the server's parsers (spec §5.6: no Zod in the browser).

export const PROFILE_FIELDS = ['name', 'locale', 'theme'] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]
export type ProfileIssue = 'required' | 'too_long' | 'invalid'

export const STORE_FIELDS = ['storeName', 'supportEmail', 'timezone', 'lowStockDefault'] as const
export type StoreField = (typeof STORE_FIELDS)[number]
export type StoreIssue = 'required' | 'too_long' | 'email_invalid' | 'timezone_invalid' | 'number_invalid'

/** As the users table allows a name. */
export const NAME_MAX = 120
/** As the store_settings table allows a store name. */
export const STORE_NAME_MAX = 80
export const SUPPORT_EMAIL_MAX = 254
/** A threshold above this is no longer a "low" stock for a poster shop. */
export const LOW_STOCK_MAX = 999

/** The time zones the store may pick: the platform's canonical list, which the form offers as it is. */
export function timeZones(): string[] {
  return Intl.supportedValuesOf('timeZone')
}
