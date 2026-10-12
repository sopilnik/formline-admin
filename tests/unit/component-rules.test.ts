import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const components = ['src/components', 'app'].flatMap(dir => (readdirSync(new URL(dir, root), { recursive: true }) as string[])
  .filter(name => name.endsWith('.tsx'))
  .map(name => `${dir}/${name}`))
const read = (name: string): string => readFileSync(new URL(name, root), 'utf8')
const except = (...names: string[]): string[] => components.filter(name => !names.includes(name))

describe('interface pieces', () => {
  it.each(except('src/components/app/sort-header.tsx'))('%s takes the sortable column header from one place', name => {
    expect(read(name)).not.toMatch(/function SortHeader|aria-sort=/)
  })

  it.each(components)('%s stretches a row\'s link only through ROW_LINK', name => {
    expect(read(name)).not.toMatch(/after:absolute after:inset-0/)
  })

  it.each(except('src/components/products/product-thumb.tsx'))('%s draws a product thumbnail only through ProductThumb', name => {
    expect(read(name)).not.toMatch(/thumbSrc\(/)
  })

  it.each(components.filter(name => name.startsWith('app/')))('%s names a list once: the section around it takes no name of its own', name => {
    expect(read(name)).not.toMatch(/<section aria-label=\{t\('title'\)\}/)
  })
})
