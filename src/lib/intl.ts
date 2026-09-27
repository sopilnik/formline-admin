import { INTL_LOCALE, TIME_ZONE, type Locale } from '@/i18n/locale'

/** A calendar date in the interface language and the store's time zone (spec §11). */
export function formatDate(date: Date, locale: Locale, timeZone: string = TIME_ZONE): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(date)
}

/** Money is integer cents in USD; the narrow symbol in both languages ("$14,286", "14 286 $"). */
export function formatMoney(cents: number, locale: Locale, digits: 'cents' | 'whole' = 'cents'): string {
  const fraction = digits === 'whole' ? 0 : 2
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(cents / 100)
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value)
}

/** A signed change with one decimal and a real minus sign (U+2212), as the KPI cards show it. */
export function formatPercent(fraction: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(fraction).replace(/^-/, '−')
}

/** "24 Sept, 14:02" / "24 сент., 14:02" in the store zone. */
export function formatDateTime(date: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(date)
}

/** "24 Sept" / "24 сент." — chart ticks and range subtitles. */
export function formatDay(date: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', timeZone }).format(date)
}

/** "26 Aug – 24 Sept": both ends are calendar days of the zone, the end inclusive. */
export function formatDayRange(start: Date, endInclusive: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', timeZone }).formatRange(start, endInclusive)
}
