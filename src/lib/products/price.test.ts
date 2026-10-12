import { describe, expect, it } from 'vitest'
import { parsePrice, priceField, SIZE_IDS, SIZE_SURCHARGE_CENTS, variantPriceCents } from '@/lib/products/price'
// The generator's catalog holds the store's surcharges; this test keeps the panel's copy in step with it.
import { SIZES } from '@seed/catalog'

describe('variant prices', () => {
  it('uses the store surcharges', () => {
    expect(SIZE_IDS).toEqual(SIZES.map(s => s.id))
    for (const size of SIZES) expect(SIZE_SURCHARGE_CENTS[size.id]).toBe(size.surchargeCents)
  })

  it('adds the surcharge to the base price unless an override is set', () => {
    expect(variantPriceCents(2900, 'a3', null)).toBe(2900)
    expect(variantPriceCents(2900, 'a1', null)).toBe(6900)
    expect(variantPriceCents(2900, 'a1', 5500)).toBe(5500)
  })
})

describe('price fields', () => {
  it('reads a price with a point or a comma', () => {
    expect(parsePrice('29')).toBe(2900)
    expect(parsePrice(' 29.5 ')).toBe(2950)
    expect(parsePrice('29,00')).toBe(2900)
    expect(parsePrice('0.01')).toBe(1)
    expect(parsePrice('9999.99')).toBe(999_999)
  })

  it('refuses anything else', () => {
    for (const bad of ['', '0', '0.00', '10000', '29.999', '-5', '1,234.00', '$29', '29 00', 'abc']) expect(parsePrice(bad), bad).toBeNull()
  })

  it('writes the field in the language of the page', () => {
    expect(priceField(2900, 'en')).toBe('29.00')
    expect(priceField(2950, 'ru')).toBe('29,50')
  })
})
