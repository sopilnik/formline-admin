import { describe, expect, it } from 'vitest'
import { parseCollection } from '@/lib/collections/form'

describe('parseCollection', () => {
  it('trims the text and derives the slug from the name', () => {
    expect(parseCollection({ name: ' Deep Sea ', slug: '', description: ' Blue on blue. ' })).toEqual({ ok: true, data: { name: 'Deep Sea', slug: 'deep-sea', description: 'Blue on blue.' } })
    expect(parseCollection({ name: 'Ночь', slug: '', description: '' })).toEqual({ ok: true, data: { name: 'Ночь', slug: 'noch', description: '' } })
  })

  it('keeps a typed slug within 60 characters', () => {
    expect(parseCollection({ name: 'Deep Sea', slug: 'Sea', description: '' })).toEqual({ ok: true, data: { name: 'Deep Sea', slug: 'sea', description: '' } })
    expect(parseCollection({ name: 'Deep Sea', slug: 'a'.repeat(61), description: '' })).toEqual({ ok: false, fieldErrors: { slug: 'slug_invalid' } })
  })

  it('names each problem', () => {
    expect(parseCollection({ name: '', slug: '', description: 'x'.repeat(2001) })).toEqual({ ok: false, fieldErrors: { name: 'name_required', description: 'description_too_long' } })
    expect(parseCollection({ name: 'x'.repeat(81), slug: 'ok', description: '' })).toEqual({ ok: false, fieldErrors: { name: 'name_too_long' } })
    expect(parseCollection({ name: '!!!', slug: '', description: '' })).toEqual({ ok: false, fieldErrors: { slug: 'slug_required' } })
    expect(parseCollection({ name: '\u200b\u200b\u200b', slug: 'invisible', description: '' })).toEqual({ ok: false, fieldErrors: { name: 'name_required' } })
  })

  it('counts a line break of the description once, as the field does, and keeps it as LF', () => {
    const lines = Array.from({ length: 15 }, () => 'x'.repeat(131))
    const result = parseCollection({ name: 'Newline check', slug: '', description: `${lines.join('\r\n')}\r\n${'y'.repeat(15)}` })
    expect(result.ok && result.data.description).toBe(`${lines.join('\n')}\n${'y'.repeat(15)}`)
  })
})
