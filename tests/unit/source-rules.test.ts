import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const sources = ['src', 'app'].flatMap(dir => (readdirSync(new URL(dir, root), { recursive: true }) as string[])
  .filter(name => /\.tsx?$/.test(name))
  .map(name => `${dir}/${name}`))

const lib = sources.filter(name => name.startsWith('src/lib/'))
const code = sources.filter(name => !/\.test\.tsx?$/.test(name))
const hrefModules = ['src/lib/collections/view.ts', 'src/lib/customers/view.ts', 'src/lib/orders/view.ts', 'src/lib/products/view.ts']

describe('source files', () => {
  it.each(sources)('%s writes no invisible character literally', name => {
    expect(readFileSync(new URL(name, root), 'utf8')).not.toMatch(/[\u0300-\u036f\u200b-\u200f\u2060\ufeff]/)
  })

  it.each(lib)('%s takes nothing from the server layer', name => {
    expect(readFileSync(new URL(name, root), 'utf8')).not.toMatch(/from '@\/server\//)
  })

  it.each(code.filter(name => !hrefModules.includes(name)))('%s builds a record\'s or a list\'s address through its href helper', name => {
    expect(readFileSync(new URL(name, root), 'utf8')).not.toMatch(/`\/(orders|customers|products|collections)\/\$\{|['"]\/(orders|products)\?/)
  })
})
