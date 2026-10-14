// The fields and limits the settings forms share with the server's parsers, without Zod: the browser must not load it
// (tests/unit/client-bundle.test.ts).

export const PROFILE_FIELDS = ['name', 'locale', 'theme', 'shortcuts'] as const
export type ProfileField = (typeof PROFILE_FIELDS)[number]
export type ProfileIssue = 'required' | 'too_long' | 'invalid'

export const STORE_FIELDS = ['storeName', 'supportEmail', 'timezone', 'lowStockDefault'] as const
export type StoreField = (typeof STORE_FIELDS)[number]
export type StoreIssue = 'required' | 'too_long' | 'email_invalid' | 'timezone_invalid' | 'number_invalid'

/** As the store_settings table allows a store name. */
export const STORE_NAME_MAX = 80
export const SUPPORT_EMAIL_MAX = 254
/** A threshold above this is no longer a "low" stock for a poster shop. */
export const LOW_STOCK_MAX = 999

// Node's ICU still lists a few zones under their old names; the store offers today's, which Node and Postgres both know.
const CURRENT_ZONE_NAMES: Record<string, string> = {
  'Africa/Asmera': 'Africa/Asmara', 'America/Godthab': 'America/Nuuk', 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Atlantic/Faeroe': 'Atlantic/Faroe', 'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton', 'Pacific/Ponape': 'Pacific/Pohnpei', 'Pacific/Truk': 'Pacific/Chuuk',
}

/** A zone under today's name; a name the list has no old form for stays as it is. */
export function currentZoneName(zone: string): string {
  return CURRENT_ZONE_NAMES[zone] ?? zone
}

/** The time zones the store may pick: UTC first, then the platform's list under today's names, in order. */
export function timeZones(): string[] {
  return ['UTC', ...Intl.supportedValuesOf('timeZone').map(currentZoneName).sort()]
}
