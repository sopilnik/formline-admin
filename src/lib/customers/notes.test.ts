import { describe, expect, it } from 'vitest'
import { CUSTOMER_NOTES_MAX, parseCustomerNotes } from '@/lib/customers/notes'

describe('parseCustomerNotes', () => {
  it('trims the text and accepts empty notes, which clear them', () => {
    expect(parseCustomerNotes('  Prefers express.\n')).toEqual({ ok: true, notes: 'Prefers express.' })
    expect(parseCustomerNotes('   ')).toEqual({ ok: true, notes: '' })
  })

  it('counts characters, not UTF-16 units, up to the limit', () => {
    expect(CUSTOMER_NOTES_MAX).toBe(2000)
    expect(parseCustomerNotes('ж'.repeat(2000))).toEqual({ ok: true, notes: 'ж'.repeat(2000) })
    expect(parseCustomerNotes('🖼'.repeat(2000)).ok).toBe(true)
    expect(parseCustomerNotes('a'.repeat(2001))).toEqual({ ok: false, error: 'too_long' })
  })
})
