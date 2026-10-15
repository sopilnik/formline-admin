import { cleanText } from '@/lib/text'

export const NOTE_MAX = 1000
export type NoteError = 'required' | 'too_long'

/** An internal note: plain text, cleaned (src/lib/text.ts), 1 to 1 000 characters, counted as code points. */
export function parseNote(value: string): { ok: true; note: string } | { ok: false; error: NoteError } {
  const note = cleanText(value)

  if (!note) return { ok: false, error: 'required' }
  if ([...note].length > NOTE_MAX) return { ok: false, error: 'too_long' }

  return { ok: true, note }
}

/**
 * Lines joined into one note of at most NOTE_MAX characters: as many whole lines as fit beside a last line, made by
 * `more`, that counts the ones left out.
 */
export function fitNote(lines: string[], more: (left: number) => string): string {
  const fits = (text: string) => [...text].length <= NOTE_MAX
  const whole = lines.join('\n')

  if (fits(whole)) return whole

  for (let kept = lines.length - 1; kept > 0; kept--) {
    const note = [...lines.slice(0, kept), more(lines.length - kept)].join('\n')

    if (fits(note)) return note
  }

  return more(lines.length)
}
