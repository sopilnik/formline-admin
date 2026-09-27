import { TIME_ZONE } from '@/i18n/locale'
import type { DatePreset } from '@/lib/orders/query'

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }
/** Half-open: `start` inclusive, `end` exclusive. */
export type Range = { start: Date; end: Date }

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    formatters.set(timeZone, f)
  }
  return f
}

/** The zone itself when Intl knows it, else the default — settings rows are trusted, but a typo must not break every page. */
export function validTimeZone(value: string | null | undefined): string {
  if (!value) return TIME_ZONE
  try {
    formatter(value)
    return value
  } catch {
    return TIME_ZONE
  }
}

/** The civil time of the zone at an instant. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(p => p.type === type)?.value ?? 0)
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour') % 24, minute: read('minute'), second: read('second') }
}

const civilUtc = (p: Partial<ZonedParts> & Pick<ZonedParts, 'year' | 'month' | 'day'>): number =>
  Date.UTC(p.year, p.month - 1, p.day, p.hour ?? 0, p.minute ?? 0, p.second ?? 0)

/**
 * The instant of a civil time of the zone. Two correction passes through Intl settle
 * the offset; a time inside a spring gap lands just after the gap, a time repeated in an
 * autumn overlap takes the later of the two. No Temporal: Node does not ship it yet.
 */
export function zonedToDate(parts: Partial<ZonedParts> & Pick<ZonedParts, 'year' | 'month' | 'day'>, timeZone: string): Date {
  const wanted = civilUtc(parts)
  let guess = wanted
  for (let pass = 0; pass < 2; pass++) guess += wanted - civilUtc(zonedParts(new Date(guess), timeZone))
  return new Date(guess)
}

export function startOfDay(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  return zonedToDate({ year: p.year, month: p.month, day: p.day }, timeZone)
}

export function startOfMonth(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  return zonedToDate({ year: p.year, month: p.month, day: 1 }, timeZone)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Calendar days later (or earlier) at the same civil time of day — a day across a DST switch is 23 or 25 hours long. */
export function addDays(date: Date, days: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return zonedToDate({ ...p, year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }, timeZone)
}

/** Calendar months later (or earlier); the day of month is clamped to the target month's length. */
export function addMonths(date: Date, months: number, timeZone: string): Date {
  const p = zonedParts(date, timeZone)
  const index = p.year * 12 + (p.month - 1) + months
  const year = Math.floor(index / 12)
  const month = index - year * 12 + 1
  return zonedToDate({ ...p, year, month, day: Math.min(p.day, daysInMonth(year, month)) }, timeZone)
}

/** The date filter of the orders list (spec §8.2, amendment 2): whole calendar days of the zone, today included. */
export function presetRange(preset: DatePreset, now: Date, timeZone: string): Range | null {
  if (preset === 'any') return null
  const end = addDays(startOfDay(now, timeZone), 1, timeZone)
  if (preset === 'today') return { start: startOfDay(now, timeZone), end }
  if (preset === '7d') return { start: addDays(startOfDay(now, timeZone), -6, timeZone), end }
  if (preset === '30d') return { start: addDays(startOfDay(now, timeZone), -29, timeZone), end }
  return { start: startOfMonth(now, timeZone), end }
}
