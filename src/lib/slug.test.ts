import { describe, expect, it } from 'vitest'
import { isSlug, slugify } from '@/lib/slug'

describe('slugify', () => {
  it('turns a name into lowercase words joined by hyphens', () => {
    expect(slugify('Nine by Twelve', 80)).toBe('nine-by-twelve')
    expect(slugify('  After   Dark!  ', 80)).toBe('after-dark')
    expect(slugify('Ninety-Six', 80)).toBe('ninety-six')
  })

  it('drops accents and transliterates Russian', () => {
    expect(slugify('Café Crème', 80)).toBe('cafe-creme')
    expect(slugify('Тихий час', 80)).toBe('tikhiy-chas')
    expect(slugify('Щука и ёж', 80)).toBe('shchuka-i-ezh')
  })

  it('cuts at the limit without leaving a hyphen at the end', () => {
    expect(slugify('abc def', 4)).toBe('abc')
    expect(slugify('a'.repeat(100), 80)).toHaveLength(80)
  })

  it('returns an empty string when nothing is left', () => {
    expect(slugify('!!!', 80)).toBe('')
    expect(slugify('日本', 80)).toBe('')
  })
})

describe('isSlug', () => {
  it('accepts what slugify makes and refuses everything else', () => {
    expect(isSlug('nine-by-twelve', 80)).toBe(true)
    expect(isSlug('a1', 80)).toBe(true)

    // The last one ends in a Cyrillic "е" that looks like the Latin one.
    for (const bad of ['', 'Nine', 'nine--twelve', '-nine', 'nine-', 'nine twelve', 'ninе']) {
      expect(isSlug(bad, 80), bad).toBe(false)
    }
  })

  it('keeps to the length and the reserved addresses', () => {
    expect(isSlug('a'.repeat(60), 60)).toBe(true)
    expect(isSlug('a'.repeat(61), 60)).toBe(false)
    expect(isSlug('new', 80)).toBe(false)
    expect(isSlug('new-arrivals', 80)).toBe(true)
  })
})
