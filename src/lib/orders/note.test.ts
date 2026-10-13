import { describe, expect, it } from 'vitest'
import { NOTE_MAX, parseNote } from '@/lib/orders/note'

describe('parseNote', () => {
  it('trims the text and takes 1 to 1 000 characters', () => {
    expect(parseNote('  Customer asked for a gift wrap.  ')).toEqual({ ok: true, note: 'Customer asked for a gift wrap.' })
    expect(parseNote('   ')).toEqual({ ok: false, error: 'required' })
    expect(parseNote('ж'.repeat(NOTE_MAX))).toEqual({ ok: true, note: 'ж'.repeat(NOTE_MAX) })
    expect(parseNote('ж'.repeat(NOTE_MAX + 1))).toEqual({ ok: false, error: 'too_long' })
  })
})
