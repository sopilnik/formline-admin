import { statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COLLECTIONS, PALETTES, POSTERS, PRODUCTS, shippingCents, SIZES, skuOf, unitPriceCents } from './catalog.ts'

describe('catalog snapshot', () => {
  it('has the store shape: four collections, sixteen posters, three sizes, six palettes', () => {
    expect(COLLECTIONS.map(c => c.slug)).toEqual(['monochrome', 'primary', 'pastel', 'night'])
    expect(PRODUCTS).toHaveLength(16)
    expect(SIZES.map(s => [s.id, s.surchargeCents])).toEqual([['a3', 0], ['a2', 1600], ['a1', 4000]])
    expect(Object.keys(PALETTES).sort()).toEqual(['ink', 'ocean', 'paper', 'sage', 'sand', 'signal'])
  })

  it('every product points at a known collection and known palettes, with a unique slug', () => {
    const slugs = new Set(PRODUCTS.map(p => p.slug))
    expect(slugs.size).toBe(PRODUCTS.length)
    for (const p of PRODUCTS) {
      expect(COLLECTIONS.some(c => c.slug === p.collection), p.slug).toBe(true)
      expect(p.palettes.every(id => id in PALETTES), p.slug).toBe(true)
      expect(p.basePriceCents).toBeGreaterThan(0)
    }
  })

  it('SKUs and prices follow the store', () => {
    const loud = PRODUCTS.find(p => p.slug === 'loud')!
    expect(skuOf('loud', 'a2', 'signal')).toBe('loud-a2-signal')
    expect(unitPriceCents(loud, 'a3')).toBe(2900)
    expect(unitPriceCents(loud, 'a1')).toBe(6900)
    expect(shippingCents(14_999, 'standard')).toBe(900)
    expect(shippingCents(14_999, 'express')).toBe(1900)
    expect(shippingCents(15_000, 'express')).toBe(0)
  })

  it('every poster file exists with the pinned size', () => {
    for (const p of PRODUCTS) {
      const poster = POSTERS[p.slug]
      expect(poster, p.slug).toBeDefined()
      const file = statSync(new URL(`../../public/posters/${p.slug}.webp`, import.meta.url))
      expect(file.size, p.slug).toBe(poster!.bytes)
      expect([poster!.width, poster!.height]).toEqual([720, 1018])
    }
  })
})
