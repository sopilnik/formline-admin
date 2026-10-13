export const NOTE_MAX = 1000
export type NoteError = 'required' | 'too_long'

/** An internal note: plain text, trimmed, 1 to 1 000 characters, counted as code points. */
export function parseNote(value: string): { ok: true; note: string } | { ok: false; error: NoteError } {
  const note = value.trim()
  if (!note) return { ok: false, error: 'required' }
  if ([...note].length > NOTE_MAX) return { ok: false, error: 'too_long' }
  return { ok: true, note }
}
