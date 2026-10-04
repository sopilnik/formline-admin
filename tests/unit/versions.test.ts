import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('versions', () => {
  it('names one Node major and one pnpm in every place that runs the panel', () => {
    const node = read('.nvmrc').trim()
    const pkg = JSON.parse(read('package.json')) as { engines: { node: string }; packageManager: string }
    const dockerfile = read('Dockerfile')
    expect(pkg.engines.node).toBe(`>=${node}`)
    const images = [...dockerfile.matchAll(/^FROM (\S+)/gm)].map(m => m[1])
    expect(images).toHaveLength(2)
    expect(new Set(images).size).toBe(1)
    expect(images[0]).toMatch(new RegExp(`^node:${node}-slim@sha256:[0-9a-f]{64}$`))
    const pnpm = pkg.packageManager.replace(/^pnpm@/, '')
    expect(pnpm).toMatch(/^\d+\.\d+\.\d+$/)
    expect(dockerfile).toContain(`\nARG PNPM_VERSION=${pnpm}\n`)
  })
})
