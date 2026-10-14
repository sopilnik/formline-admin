import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const tests = ['app', 'db', 'scripts', 'src', 'tests'].flatMap(dir => (readdirSync(new URL(dir, root), { recursive: true }) as string[])
  .filter(name => /\.(test|spec)\.tsx?$/.test(name))
  .map(name => `${dir}/${name}`))

const read = (name: string): string => readFileSync(new URL(name, root), 'utf8')

describe('test files', () => {
  it.each(tests)('%s names the error it expects: a bare toThrow passes on a typo or a broken import', name => {
    expect(read(name)).not.toMatch(/\.toThrow\(\)/)
  })
})
