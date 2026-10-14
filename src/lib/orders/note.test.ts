import { describe, expect, it } from 'vitest'
import { fitNote, NOTE_MAX, parseNote } from '@/lib/orders/note'

describe('parseNote', () => {
  it('trims the text and takes 1 to 1 000 characters', () => {
    expect(parseNote('  Customer asked for a gift wrap.  ')).toEqual({ ok: true, note: 'Customer asked for a gift wrap.' })
    expect(parseNote('   ')).toEqual({ ok: false, error: 'required' })
    expect(parseNote('ж'.repeat(NOTE_MAX))).toEqual({ ok: true, note: 'ж'.repeat(NOTE_MAX) })
    expect(parseNote('ж'.repeat(NOTE_MAX + 1))).toEqual({ ok: false, error: 'too_long' })
  })

  it('counts a line break once, as the field does, and keeps it as LF', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${String(i).padStart(4, '0')}`)
    expect(parseNote(`${lines.join('\r\n')}x`)).toEqual({ ok: true, note: `${lines.join('\n')}x` })
  })

  it('refuses a note of invisible characters only', () => {
    expect(parseNote('\u200b\u2060\u200b')).toEqual({ ok: false, error: 'required' })
  })
})

describe('fitNote', () => {
  const more = (left: number) => `and ${left} more`

  it('joins the lines as they are when they fit', () => {
    expect(fitNote(['one', 'two'], more)).toBe('one\ntwo')
  })

  it('keeps as many whole lines as fit beside the count of the others', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `${i}`.padEnd(100, 'x'))
    const note = fitNote(lines, more)
    expect(note).toBe([...lines.slice(0, 9), 'and 3 more'].join('\n'))
    expect(note.length).toBeLessThanOrEqual(NOTE_MAX)
  })

  it('counts characters, as the database does', () => {
    const lines = Array.from({ length: 10 }, () => 'ж'.repeat(99))
    expect(fitNote(lines, more)).toBe(lines.join('\n'))
  })
})
