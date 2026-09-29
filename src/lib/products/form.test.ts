import { describe, expect, it } from 'vitest'
import type { DetailField } from '@/lib/products/fields'
import { parseProductDetails, parseTags } from '@/lib/products/form'

const COLLECTION = '5b0f1f3e-8c4a-4c55-9d0e-2f6f7c1a9b10'
const valid: Record<DetailField, string> = {
  name: ' Far Orbit ', slug: '', collection: COLLECTION, basePrice: '31', tags: 'circles, Orbit,  dark sky', description: ' Twelve rings. ',
}

describe('parseProductDetails', () => {
  it('trims the text, derives the slug from the name and reads the price and the tags', () => {
    expect(parseProductDetails(valid)).toEqual({
      ok: true,
      data: { name: 'Far Orbit', slug: 'far-orbit', collectionId: COLLECTION, basePriceCents: 3100, tags: ['circles', 'orbit', 'dark-sky'], description: 'Twelve rings.' },
    })
  })

  it('keeps a typed slug, lowercased', () => {
    const result = parseProductDetails({ ...valid, slug: ' Orbit-12 ' })
    expect(result.ok && result.data.slug).toBe('orbit-12')
  })

  it('names the problem of every field at once', () => {
    const result = parseProductDetails({ name: ' ', slug: 'Far Orbit', collection: 'nope', basePrice: '0', tags: 'ok, not/ok', description: 'x'.repeat(4001) })
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: 'name_required', collection: 'collection_missing', basePrice: 'price_invalid', tags: 'tags_invalid', description: 'description_too_long' },
    })
  })

  it('asks for a slug when the name gives none, and refuses a malformed or reserved one', () => {
    expect(parseProductDetails({ ...valid, name: '日本' })).toEqual({ ok: false, fieldErrors: { slug: 'slug_required' } })
    expect(parseProductDetails({ ...valid, slug: 'far orbit' })).toEqual({ ok: false, fieldErrors: { slug: 'slug_invalid' } })
    expect(parseProductDetails({ ...valid, slug: 'new' })).toEqual({ ok: false, fieldErrors: { slug: 'slug_invalid' } })
  })

  it('keeps a long name out', () => {
    expect(parseProductDetails({ ...valid, name: 'x'.repeat(121) })).toEqual({ ok: false, fieldErrors: { name: 'name_too_long' } })
  })
})

describe('parseTags', () => {
  it('accepts an empty list and Russian words', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags(' , ,')).toEqual([])
    expect(parseTags('Ночь, тёмный фон')).toEqual(['ночь', 'тёмный-фон'])
  })

  it('refuses more than twelve tags or a tag that is not a word', () => {
    expect(parseTags(Array.from({ length: 13 }, (_, i) => `t${i}`).join(','))).toBeNull()
    expect(parseTags('x'.repeat(31))).toBeNull()
    expect(parseTags('#bold')).toBeNull()
  })
})
