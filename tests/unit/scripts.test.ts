import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))

describe('the scripts the workflows run', () => {
  it.each(['scripts/guard.ts', 'scripts/deploy-image.ts', 'scripts/smoke.ts', 'scripts/probe.ts'])('%s loads as a module without a warning', script => {
    // Without its settings each script refuses at once; what matters here is what Node prints before that.
    const run = spawnSync(process.execPath, [script], { cwd: root, env: { NODE_ENV: 'test', PATH: process.env.PATH }, encoding: 'utf8', timeout: 30_000 })
    expect(run.status).toBe(1)
    expect(run.stderr).not.toMatch(/MODULE_TYPELESS_PACKAGE_JSON/)
  })
})
