import { describe, expect, it } from 'vitest'
import { containsPattern } from '@/server/db/like'

describe('containsPattern', () => {
  it('wraps the text and escapes the wildcards and the escape character', () => {
    expect(containsPattern('orbit')).toBe('%orbit%')
    expect(containsPattern('50%_off\\')).toBe('%50\\%\\_off\\\\%')
  })
})
