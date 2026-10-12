import { describe, expect, it } from 'vitest'
import { parseLocale } from '@/i18n/locale'

describe('locale', () => {
  it('knows English and Russian and falls back to English', () => {
    expect(parseLocale('ru')).toBe('ru')
    expect(parseLocale('en')).toBe('en')
    expect(parseLocale('de')).toBe('en')
    expect(parseLocale(undefined)).toBe('en')
  })
})
