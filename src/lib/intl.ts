import { INTL_LOCALE, type Locale } from '@/i18n/locale'

/** A calendar date in the interface language and the store's time zone. */
export function formatDate(date: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(date)
}

/** A country's name in the interface language ("DE": "Germany", «Германия»); a value that is no region code stays as stored. */
export function countryName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([INTL_LOCALE[locale]], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
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
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(fraction).replace(/^-/, '\u2212')
}

/** A share without a sign ("36%", "12.4%"): the collection shares and the chart's summary. */
export function formatShare(fraction: number, locale: Locale, digits = 0): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'percent', maximumFractionDigits: digits }).format(fraction)
}

/** "24 Sept, 14:02" / "24 сент., 14:02" in the store zone. */
export function formatDateTime(date: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(date)
}

/** "24 Sept" / "24 сент." — chart ticks and range subtitles. */
export function formatDay(date: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', timeZone }).format(date)
}

/**
 * "26 Aug – 24 Sept": both ends are calendar days of the zone, the end inclusive. A day keeps its month and its year
 * (no-break spaces everywhere but around the dash), so a narrow column breaks the range only at the dash.
 */
export function formatDayRange({ start, endInclusive }: { start: Date; endInclusive: Date }, locale: Locale, timeZone: string): string {
  const range = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'short', timeZone }).formatRange(start, endInclusive)

  return range.replaceAll(' ', '\u00a0').replace('\u00a0–\u00a0', ' – ')
}

/** Compares names in the Unicode root order, as Postgres's "unicode" collation sorts them: a list sorted here agrees with one a query sorted. */
export const compareNames = new Intl.Collator('und').compare
