import { describe, expect, it } from 'vitest'
import { cleanLine, cleanText } from '@/lib/text'

describe('cleanLine', () => {
  it('drops whitespace and format characters at either end, so an invisible name reads as empty', () => {
    expect(cleanLine('\u200b\u200b\u200b')).toBe('')
    expect(cleanLine(' \u2060\ufeff Ann Berg \u200d\u200e')).toBe('Ann Berg')
  })

  it('keeps the format characters inside a value', () => {
    expect(cleanLine('👨\u200d👩\u200d👧')).toBe('👨\u200d👩\u200d👧')
    expect(cleanLine('a\u200cb')).toBe('a\u200cb')
  })
})

describe('cleanText', () => {
  it('counts each line break once, as the field does, and cleans the ends', () => {
    expect(cleanText('one\r\ntwo\rthree\n')).toBe('one\ntwo\nthree')
    expect(cleanText('\r\n\u200b\r\n')).toBe('')
  })
})
