import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('the repository', () => {
  it('names a private way to report a vulnerability', () => {
    const policy = read('SECURITY.md').replace(/\s+/g, ' ')

    expect(policy).toContain('private vulnerability reporting')
    expect(policy).toContain('Never in a public issue')
    expect(read('README.md')).toContain('[SECURITY.md](SECURITY.md)')
  })

  it('ships an image whose last stage keeps no package manager', () => {
    const final = read('Dockerfile').split(/\nFROM /)[2]!

    expect(final).toContain('rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx')
  })
})
