import { describe, expect, it } from 'vitest'
import { compareVariants, imageSrc, PALETTE_IDS, paletteName, variantLabel } from '@/lib/catalog'
// The generator's catalog is the source of the names; this test keeps the panel's copy in step with it.
// eslint-disable-next-line no-restricted-imports
import { PALETTES, SIZES } from '../../db/seed/catalog'

describe('catalog labels', () => {
  it('names every size and palette of the store the way the catalog does', () => {
    for (const size of SIZES) for (const [palette, name] of Object.entries(PALETTES)) expect(variantLabel(size.id, palette)).toBe(`${size.label} · ${name}`)
    expect(variantLabel('a0', 'teal')).toBe('A0 · teal')
  })

  it('lists the palettes in the store order and sorts variants by palette, then size', () => {
    expect(PALETTE_IDS).toEqual(Object.keys(PALETTES))
    expect(paletteName('ocean')).toBe('Ocean')
    expect(paletteName('teal')).toBe('teal')
    const variants = [{ size: 'a1', palette: 'ink' }, { size: 'a3', palette: 'ocean' }, { size: 'a3', palette: 'ink' }, { size: 'a2', palette: 'paper' }]
    expect([...variants].sort(compareVariants)).toEqual([{ size: 'a2', palette: 'paper' }, { size: 'a3', palette: 'ink' }, { size: 'a1', palette: 'ink' }, { size: 'a3', palette: 'ocean' }])
  })

  it('serves template posters from public/ and uploads through the media route', () => {
    expect(imageSrc({ id: 'i1', storagePath: 'posters/loud.webp', source: 'static' })).toBe('/posters/loud.webp')
    expect(imageSrc({ id: 'i2', storagePath: 'ws/abc.webp', source: 'upload' })).toBe('/media/i2')
  })
})
