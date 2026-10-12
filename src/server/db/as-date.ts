/**
 * A timestamptz from a raw statement. Through a workspace transaction (Drizzle's `execute`) the driver hands it over as
 * text, where a plain pool query gives a Date; either way this answers a Date.
 */
export function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}
