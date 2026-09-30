import { describe, expect, it } from 'vitest'
import { orderNumberOf, searchTerm } from '@/lib/search'

describe('searchTerm', () => {
  it('trims the term and folds its inner spaces', () => {
    expect(searchTerm('  far   orbit ')).toBe('far orbit')
    expect(searchTerm('Ян')).toBe('Ян')
  })

  it('searches nothing for one character, nothing at all, or more than a hundred', () => {
    expect(searchTerm('a')).toBeNull()
    expect(searchTerm(' ')).toBeNull()
    expect(searchTerm(null)).toBeNull()
    expect(searchTerm('x'.repeat(101))).toBeNull()
    expect(searchTerm('x'.repeat(100))).toBe('x'.repeat(100))
  })
})

describe('orderNumberOf', () => {
  it('reads an order number with or without its sign', () => {
    expect(orderNumberOf('1700')).toBe(1700)
    expect(orderNumberOf('#1700')).toBe(1700)
    expect(orderNumberOf('17 00')).toBeNull()
    expect(orderNumberOf('mia')).toBeNull()
    expect(orderNumberOf('1234567890')).toBeNull()
  })
})
