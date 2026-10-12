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

  it.each(except('src/components/app/detail-page.tsx'))('%s takes the back link and the card classes from the detail page kit', name => {
    expect(read(name)).not.toMatch(/<ArrowLeft|const CARD(_TITLE)? = /)
  })

  it.each(components)('%s imports through @/, never by a relative path', name => {
    expect(read(name)).not.toMatch(/from '\.\.?\//)
  })

  it.each(components.filter(name => name.startsWith('app/(app)/') && name.endsWith('/not-found.tsx')))('%s says "not found" inside the frame, without a main of its own', name => {
    expect(read(name)).toMatch(/<(Detail|Page)NotFound[ />]/)
    expect(read(name)).not.toContain('<main')
  })

  it.each(components)('%s takes the form pieces from components/app', name => {
    expect(read(name)).not.toMatch(/@\/components\/auth\/(text-field|form-parts)'/)
  })

  it.each(except('src/components/app/form-parts.tsx'))('%s draws an error alert only through ErrorAlert', name => {
    expect(read(name)).not.toMatch(/border border-destructive px-3 py-2/)
  })

  it.each(except('src/components/app/form-fields.tsx'))('%s labels a text area only through TextAreaField', name => {
    expect(read(name)).not.toMatch(/<textarea/)
  })

  it.each(components.filter(name => name.startsWith('src/components/')))('%s exports components, not async helpers', name => {
    expect(read(name)).not.toMatch(/export async function [a-z]/)
  })

  it.each(components)('%s leaves no English close label in a dialog or a sheet', name => {
    expect(read(name)).not.toMatch(/>Close</)
  })

  it.each(components)('%s asks for an Apple device only through useIsApple', name => {
    expect(read(name)).not.toMatch(/navigator\.platform/)
  })
})
