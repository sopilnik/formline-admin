import { afterEach, describe, expect, it, vi } from 'vitest'
import { E2E_WORKERS, e2eWorker } from '../e2e/constants'

type Server = { url: string; env?: Record<string, string> }

/** The Playwright config as a run with or without CI reads it: the module reads the variable once, when it loads. */
async function config(ci: string | undefined) {
  vi.resetModules()
  vi.stubEnv('CI', ci)
  return (await import('../../playwright.config')).default
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the end-to-end config', () => {
  it('gives each of the four workers its own port, database and media folder', () => {
    const workers = Array.from({ length: E2E_WORKERS }, (_, index) => e2eWorker(index))

    expect(E2E_WORKERS).toBe(4)
    for (const key of ['port', 'database', 'mediaDir'] as const) expect(new Set(workers.map(worker => worker[key])).size).toBe(4)
    expect(workers.map(worker => worker.port)).not.toContain(4334)
  })

  it('starts one server per worker on that worker\'s address, database and media folder, besides the Stripe stand-in', async () => {
    const { workers, webServer } = await config(undefined)
    const servers = (webServer as Server[]).slice(1)

    expect(workers).toBe(E2E_WORKERS)
    expect((webServer as Server[])[0]!.url).toBe('http://127.0.0.1:4334/health')
    expect(servers.map(server => [server.url, server.env?.SITE_URL, server.env?.DATABASE_URL, server.env?.MEDIA_STORAGE_DIR])).toEqual(
      Array.from({ length: E2E_WORKERS }, (_, index) => {
        const worker = e2eWorker(index)
        return [`http://127.0.0.1:${worker.port}/api/health`, worker.baseUrl, worker.appUrl, worker.mediaDir]
      }))
    // A developer's .env, which the build copies beside the server, must not turn the edge check off.
    expect(servers.map(server => server.env?.ORIGIN_AUTH_DISABLED)).toEqual(Array(E2E_WORKERS).fill('0'))
  })

  it('dispatches the owner tests first, on their own project', async () => {
    const { projects } = await config(undefined)

    expect(projects).toEqual([{ name: 'owner', testMatch: 'owner.spec.ts' }, { name: 'panel', testIgnore: 'owner.spec.ts' }])
  })

  it('refuses a focused test on CI and keeps the report, the traces and the screenshots of a failure', async () => {
    const ci = await config('true')

    expect(ci.forbidOnly).toBe(true)
    expect(ci.reporter).toEqual([['list'], ['html', { open: 'never' }]])
    expect(ci.use).toMatchObject({ trace: 'retain-on-failure', screenshot: 'only-on-failure' })
    expect((await config(undefined)).forbidOnly).toBe(false)
  })
})
