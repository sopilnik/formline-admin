import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = new URL('../../src/server/actions/', import.meta.url)
const files = readdirSync(dir).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
const read = (name: string): string => readFileSync(new URL(name, dir), 'utf8')

describe('server actions', () => {
  it.each(files)('%s refuses by returning, never by throwing from authorize()', name => {
    expect(read(name)).not.toMatch(/\bauthorize\(/)
  })

  it.each(files)('%s answers a refusal with the shared fail(), never a copy of it', name => {
    expect(read(name)).not.toMatch(/\bconst refused = /)
  })

  it.each(files)('%s takes the address hash from the shared helper', name => {
    expect(read(name)).not.toMatch(/\bhashIp\(/)
  })

  it.each(files)('%s spells a strict input schema one way, z.strictObject', name => {
    expect(read(name)).not.toMatch(/\.strict\(\)/)
  })
})
