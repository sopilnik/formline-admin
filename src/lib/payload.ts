// Readers for the JSON the database keeps beside a row (activity details, notification and letter payloads): one rule for
// each kind of value, so a name that is only spaces is absent everywhere alike.

export type Payload = Record<string, unknown>

/** A JSON object; null for an array or a plain value. */
export function asRecord(value: unknown): Payload | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Payload) : null
}

/** A text with more than spaces in it. */
export function text(payload: Payload, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** A whole number, of either sign. */
export function whole(payload: Payload, key: string): number | null {
  const value = payload[key]
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

/** A whole number from zero. */
export function count(payload: Payload, key: string): number | null {
  const value = whole(payload, key)
  return value !== null && value >= 0 ? value : null
}

/** A UUID as Postgres writes it: lowercase, with its hyphens. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
