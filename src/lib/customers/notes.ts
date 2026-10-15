import { cleanText } from '@/lib/text'

export const CUSTOMER_NOTES_MAX = 2000
export type CustomerNotesError = 'too_long'

/**
 * A customer's notes: plain text, cleaned (src/lib/text.ts); empty clears them. At most 2 000
 * characters, counted as code points, as the database's check counts them.
 */
export function parseCustomerNotes(value: string): { ok: true; notes: string } | { ok: false; error: CustomerNotesError } {
  const notes = cleanText(value)

  if ([...notes].length > CUSTOMER_NOTES_MAX) {
    return { ok: false, error: 'too_long' }
  }

  return { ok: true, notes }
}
