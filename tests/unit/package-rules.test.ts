import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('package.json', () => {
  it('pins every dependency to an exact version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      expect(`${name}@${version}`).toMatch(/@\d+\.\d+\.\d+$/)
    }
  })
})
