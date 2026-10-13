/** At most this many rows in one file; above it the first ones in the list's order. */
export const EXPORT_CAP = 10_000

/** First in the file: spreadsheets then read it as UTF-8 and show Cyrillic names. */
export const CSV_BOM = '\uFEFF'

// A cell a spreadsheet would evaluate (OWASP, "CSV injection"): =, +, -, @, tab, carriage return.
const FORMULA_START = /^[=+\-@\t\r]/

/** A text cell: a formula starter gets a leading apostrophe; quotes, commas and line breaks are quoted (RFC 4180). */
export function csvText(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Dollars with two decimals and a dot, whatever the interface language. */
export function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** One record with the CRLF line end of RFC 4180. */
export function csvRecord(cells: readonly string[]): string {
  return `${cells.join(',')}\r\n`
}
