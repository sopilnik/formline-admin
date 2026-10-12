import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const sources = ['src', 'app'].flatMap(dir => (readdirSync(new URL(dir, root), { recursive: true }) as string[])
  .filter(name => /\.tsx?$/.test(name))
  .map(name => `${dir}/${name}`))

describe('source files', () => {
  it.each(sources)('%s writes no invisible character literally', name => {
    expect(readFileSync(new URL(name, root), 'utf8')).not.toMatch(/[\u0300-\u036f\u200b-\u200f\u2060\ufeff]/)
  })
})
