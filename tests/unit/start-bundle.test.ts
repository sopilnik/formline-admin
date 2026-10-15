import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)

describe('the container start bundle', () => {
  it('builds into one file that runs alone and refuses an empty environment before anything else', () => {
    const build = spawnSync('pnpm', ['build:start'], { cwd: root, encoding: 'utf8' })

    expect(build.status, build.stderr).toBe(0)

    // Nothing but PATH: Next.js declares NODE_ENV required on ProcessEnv, and the start must refuse to run without it.
    const empty = { PATH: process.env.PATH } as unknown as NodeJS.ProcessEnv
    const run = spawnSync(process.execPath, ['dist/start.mjs'], { cwd: root, env: empty, encoding: 'utf8', timeout: 20_000 })

    expect(run.status).toBe(1)

    // One line: the start's refusal. A second entry point inside the bundle, such as the migrations' own CLI, would add one.
    const events = run.stdout.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)

    expect(events).toEqual([expect.objectContaining({ event: 'start.refused' })])
  }, 60_000)
})
