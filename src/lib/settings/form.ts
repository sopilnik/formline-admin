import { z } from 'zod'
import { LOCALES, type Locale } from '@/i18n/locale'
import { LOW_STOCK_MAX, STORE_NAME_MAX, SUPPORT_EMAIL_MAX, timeZones, type ProfileField, type ProfileIssue, type StoreField, type StoreIssue } from '@/lib/settings/fields'
import { MEMBER_NAME_MAX } from '@/lib/team'
import { cleanLine } from '@/lib/text'
import { THEMES, type Theme } from '@/lib/theme'

export type Profile = { name: string; locale: Locale; theme: Theme; shortcuts: boolean }
export type StoreSettingsInput = { storeName: string; supportEmail: string; timezone: string; lowStockDefault: number }

type Parsed<T, F extends string, I extends string> = { ok: true; data: T } | { ok: false; fieldErrors: Partial<Record<F, I>> }

const length = (value: string): number => [...value].length

/**
 * The profile form: a name of 1 to 120 characters, one of the two languages, one of the three themes, and the
 * single-key shortcuts on or off — a checkbox, which a form sends only when it is ticked.
 */
export function parseProfile(values: Record<ProfileField, string>): Parsed<Profile, ProfileField, ProfileIssue> {
  const fieldErrors: Partial<Record<ProfileField, ProfileIssue>> = {}
  const name = cleanLine(values.name)
  if (!name) fieldErrors.name = 'required'
  else if (length(name) > MEMBER_NAME_MAX) fieldErrors.name = 'too_long'
  const locale = z.enum(LOCALES).safeParse(values.locale)
  if (!locale.success) fieldErrors.locale = 'invalid'
  const theme = z.enum(THEMES).safeParse(values.theme)
  if (!theme.success) fieldErrors.theme = 'invalid'
  if (Object.keys(fieldErrors).length > 0 || !locale.success || !theme.success) return { ok: false, fieldErrors }
  return { ok: true, data: { name, locale: locale.data, theme: theme.data, shortcuts: values.shortcuts === 'on' } }
}

/**
 * The store form: a name of 1 to 80 characters, a support email, a time zone the platform knows
 * (it draws the overview's day boundaries) and a low-stock threshold from 0 to 999 for new variants.
 */
export function parseStoreSettings(values: Record<StoreField, string>): Parsed<StoreSettingsInput, StoreField, StoreIssue> {
  const fieldErrors: Partial<Record<StoreField, StoreIssue>> = {}
  const storeName = cleanLine(values.storeName)
  if (!storeName) fieldErrors.storeName = 'required'
  else if (length(storeName) > STORE_NAME_MAX) fieldErrors.storeName = 'too_long'
  const supportEmail = values.supportEmail.trim().toLowerCase()
  if (!z.email().max(SUPPORT_EMAIL_MAX).safeParse(supportEmail).success) fieldErrors.supportEmail = 'email_invalid'
  const timezone = values.timezone.trim()
  if (!timeZones().includes(timezone)) fieldErrors.timezone = 'timezone_invalid'
  const threshold = values.lowStockDefault.trim()
  const lowStockDefault = /^\d{1,3}$/.test(threshold) ? Number(threshold) : NaN
  if (!(lowStockDefault >= 0 && lowStockDefault <= LOW_STOCK_MAX)) fieldErrors.lowStockDefault = 'number_invalid'
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return { ok: true, data: { storeName, supportEmail, timezone, lowStockDefault } }
}
