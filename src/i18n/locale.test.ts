import { describe, expect, it } from 'vitest'
import { INTL_LOCALE, parseLocale } from '@/i18n/locale'

describe('locale', () => {
  it('knows English and Russian and falls back to English', () => {
    expect(parseLocale('ru')).toBe('ru')
    expect(parseLocale('en')).toBe('en')
    expect(parseLocale('de')).toBe('en')
    expect(parseLocale(undefined)).toBe('en')
  })

  it('formats English in the British style', () => {
    expect(INTL_LOCALE).toEqual({ en: 'en-GB', ru: 'ru-RU' })
  })
})
