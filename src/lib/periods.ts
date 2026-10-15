import { TIME_ZONE } from '@/i18n/locale'
import type { DatePreset } from '@/lib/orders/query'

/** One day in milliseconds, for spans that ignore the clock: the daily job's interval, the Stripe import's window. */
export const DAY_MS = 86_400_000

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

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/** "2026-09-24": the civil date of the zone at that instant (the name of an exported file). */
export function dateInZone(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)

  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

/** "2026-09-24T14:02:00+02:00": the civil time of the zone and its offset at that instant (the CSV's Placed column). */
export function isoInZone(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  const offset = Math.round((civilUtc(p) - date.getTime()) / 60_000)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)

  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
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

/** The date filter of the orders list: whole calendar days of the zone, today included. */
export function presetRange(preset: DatePreset, now: Date, timeZone: string): Range | null {
  if (preset === 'any') return null

  const end = addDays(startOfDay(now, timeZone), 1, timeZone)

  if (preset === 'today') return { start: startOfDay(now, timeZone), end }
  if (preset === '7d') return { start: addDays(startOfDay(now, timeZone), -6, timeZone), end }
  if (preset === '30d') return { start: addDays(startOfDay(now, timeZone), -29, timeZone), end }

  return { start: startOfMonth(now, timeZone), end }
}

/** The overview's periods; the selector is a set of links with `?period=`. */
export const PERIODS = ['7d', '30d', '90d', 'month'] as const
export type Period = (typeof PERIODS)[number]
export const DEFAULT_PERIOD: Period = '30d'

export function parsePeriod(value: string | string[] | undefined): Period {
  const first = Array.isArray(value) ? value[0] : value

  return first !== undefined && (PERIODS as readonly string[]).includes(first) ? (first as Period) : DEFAULT_PERIOD
}

/**
 * A period of the overview with its previous period and the chart's buckets.
 * The buckets are contiguous and cover `current` exactly; `previousBuckets` are the same
 * buckets moved back and cover `previous` exactly, with null for a day the previous month lacks.
 */
export type PeriodPlan = {
  period: Period
  step: 'day' | 'week'
  current: Range
  previous: Range
  buckets: Range[]
  previousBuckets: (Range | null)[]
}

const ROLLING_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const

function dayBuckets({ start, count }: { start: Date; count: number }, now: Date, timeZone: string): Range[] {
  return Array.from({ length: count }, (_, i) => ({ start: addDays(start, i, timeZone), end: i === count - 1 ? now : addDays(start, i + 1, timeZone) }))
}

/** 7-day buckets counted back from today; the earliest one may be shorter. */
function weekBuckets(start: Date, now: Date, timeZone: string): Range[] {
  const buckets: Range[] = []
  let end = now
  let from = addDays(startOfDay(now, timeZone), -6, timeZone)

  while (end > start) {
    const bucketStart = from < start ? start : from

    buckets.unshift({ start: bucketStart, end })
    end = bucketStart
    from = addDays(from, -7, timeZone)
  }

  return buckets
}

export function periodPlan(period: Period, now: Date, timeZone: string): PeriodPlan {
  if (period === 'month') {
    const start = startOfMonth(now, timeZone)
    const previous = { start: addMonths(start, -1, timeZone), end: addMonths(now, -1, timeZone) }
    const buckets = dayBuckets({ start, count: zonedParts(now, timeZone).day }, now, timeZone)
    const month = zonedParts(previous.start, timeZone).month
    const previousBuckets = buckets.map((_, i) => {
      const dayStart = addDays(previous.start, i, timeZone)

      if (zonedParts(dayStart, timeZone).month !== month || dayStart >= previous.end) return null

      const dayEnd = addDays(dayStart, 1, timeZone)

      return { start: dayStart, end: dayEnd < previous.end ? dayEnd : previous.end }
    })

    return { period, step: 'day', current: { start, end: now }, previous, buckets, previousBuckets }
  }

  const days = ROLLING_DAYS[period]
  const start = addDays(startOfDay(now, timeZone), -(days - 1), timeZone)
  const previous = { start: addDays(start, -days, timeZone), end: addDays(now, -days, timeZone) }
  const buckets = period === '90d' ? weekBuckets(start, now, timeZone) : dayBuckets({ start, count: days }, now, timeZone)
  const previousBuckets = buckets.map(bucket => ({ start: addDays(bucket.start, -days, timeZone), end: addDays(bucket.end, -days, timeZone) }))

  return { period, step: period === '90d' ? 'week' : 'day', current: { start, end: now }, previous, buckets, previousBuckets }
}

/** The last instant inside a half-open range: the end of "26 Aug – 24 Sept". */
export function lastMoment(range: Range): Date {
  return new Date(range.end.getTime() - 1)
}
