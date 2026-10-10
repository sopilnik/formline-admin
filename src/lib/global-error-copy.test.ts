import { describe, expect, it } from 'vitest'
// The dictionaries live outside src; the test reads them as files to compare with the root error page's words.
// eslint-disable-next-line no-restricted-imports
import en from '../../messages/en.json'
// eslint-disable-next-line no-restricted-imports
import ru from '../../messages/ru.json'
import { GLOBAL_ERROR_COPY, globalErrorLocale } from './global-error-copy'

describe('the root error page’s words', () => {
  it('are the errors strings of both dictionaries', () => {
    expect(GLOBAL_ERROR_COPY.en).toEqual(en.errors)
    expect(GLOBAL_ERROR_COPY.ru).toEqual(ru.errors)
  })

  it('follow the language cookie, English by default', () => {
    expect(globalErrorLocale('NEXT_LOCALE=ru')).toBe('ru')
    expect(globalErrorLocale('formline_theme=dark; NEXT_LOCALE=ru; x=1')).toBe('ru')
    expect(globalErrorLocale('NEXT_LOCALE=en')).toBe('en')
    expect(globalErrorLocale('NOT_NEXT_LOCALE=ru')).toBe('en')
    expect(globalErrorLocale('')).toBe('en')
  })
})
