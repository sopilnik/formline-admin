import { describe, expect, it } from 'vitest'
import { parseTheme, themeClassName } from '@/lib/theme'

describe('theme', () => {
  it('falls back to System for a missing or unknown value', () => {
    expect(parseTheme(undefined)).toBe('system')
    expect(parseTheme('sepia')).toBe('system')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme('light')).toBe('light')
  })

  it('puts a class on the root only for an explicit choice', () => {
    expect(themeClassName('system')).toBeUndefined()
    expect(themeClassName('light')).toBe('light')
    expect(themeClassName('dark')).toBe('dark')
  })
})
