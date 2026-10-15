import { readdirSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { THUMB, thumbSrc } from '@/lib/thumbs'

describe('thumbSrc', () => {
  it('points a template poster at its small copy and an upload at its own', () => {
    expect(thumbSrc('/posters/hush.webp')).toBe('/posters/thumb/hush.webp')
    expect(thumbSrc('/media/0b5e1c58-2f1a-4c55-9a8e-6b0c1d2e3f40')).toBe('/media/0b5e1c58-2f1a-4c55-9a8e-6b0c1d2e3f40?size=thumb')
  })
})

describe('the template posters’ small copies', () => {
  it('exist for every poster, at the size of the lists, as WebP', async () => {
    const posters = readdirSync('public/posters').filter(name => name.endsWith('.webp'))

    expect(posters).toHaveLength(16)

    for (const name of posters) {
      const meta = await sharp(`public/posters/thumb/${name}`).metadata()

      expect([name, meta.format, meta.width, meta.height]).toEqual([name, 'webp', THUMB.width, THUMB.height])
    }
  })
})
