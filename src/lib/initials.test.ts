import { describe, expect, it } from 'vitest'
import { initials } from '@/lib/initials'

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Dana Ortiz')).toBe('DO')
    expect(initials('  priya  nair kumar ')).toBe('PN')
  })

  it('skips what is not a letter, and keeps a letter with its accent whole', () => {
    expect(initials('😀 Émile Zola')).toBe('ÉZ')
    expect(initials('E\u0301mile Zola')).toBe('E\u0301Z')
    expect(initials('«Noah» Becker')).toBe('NB')
  })

  it('falls back to the first character when the name has no letter', () => {
    expect(initials('😀')).toBe('😀')
  })
})
