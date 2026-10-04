import { describe, expect, it } from 'vitest'
import { deployImage, type DeployOptions } from './deploy-image.ts'

const TAG = '0123456789abcdef0123456789abcdef01234567'
const DIGEST = `sha256:${'a'.repeat(64)}`

type Call = { method: string; url: string; body: unknown; key: string | null }

/** bunny and the panel, answering from scripts: `versions` are what liveness reports one poll after another. */
function world(opts: { templates?: { id: string; name: string }[]; versions: (string | null)[]; statuses?: string[]; patch?: number }) {
  const calls: Call[] = []
  const statuses = [...(opts.statuses ?? [])]
  const versions = [...opts.versions]
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined, key: new Headers(init?.headers).get('AccessKey') })
    if (url.startsWith('https://formline-admin.test/api/health')) {
      const version = versions.shift() ?? null
      return version === null ? new Response('', { status: 502 }) : Response.json({ status: 'ok', version })
    }
    if (method === 'PATCH') return new Response('', { status: opts.patch ?? 200 })
    return Response.json({ status: statuses.shift() ?? 'progressing', containerTemplates: opts.templates ?? [{ id: 'c-1', name: 'web' }] })
  }) as typeof fetch
  let clock = 0
  const events: Record<string, unknown>[] = []
  const options: DeployOptions = {
    key: 'test-account-key', appId: 'app-1', container: 'web', tag: TAG, digest: DIGEST, siteUrl: 'https://formline-admin.test',
    fetch: fetchImpl, sleep: async ms => { clock += ms }, now: () => clock, log: e => { events.push(e) }, timeoutMs: 60_000, pollMs: 10_000,
  }
  return { calls, events, options }
}

describe('deployImage', () => {
  it('updates the one container to the tag and digest and waits until the panel answers with the new commit', async () => {
    const w = world({ versions: ['old-commit', null, TAG] })
    await deployImage(w.options)
    const patch = w.calls.filter(c => c.method === 'PATCH')
    expect(patch).toEqual([{ method: 'PATCH', url: 'https://api.bunny.net/mc/apps/app-1/containers/c-1', body: { imageTag: TAG, imageDigest: DIGEST }, key: 'test-account-key' }])
    expect(w.calls.filter(c => c.url.includes('/api/health')).map(c => c.url)).toEqual(Array(3).fill(`https://formline-admin.test/api/health?deploy=${TAG}`))
    expect(w.events.map(e => e.event)).toEqual(['deploy.updated', 'deploy.live'])
  })

  it('refuses a container name that is missing or not unique, before it changes anything', async () => {
    const none = world({ templates: [{ id: 'c-1', name: 'worker' }], versions: [] })
    await expect(deployImage(none.options)).rejects.toThrow('expected one container named web, found 0')
    const two = world({ templates: [{ id: 'c-1', name: 'web' }, { id: 'c-2', name: 'web' }], versions: [] })
    await expect(deployImage(two.options)).rejects.toThrow('found 2')
    expect([...none.calls, ...two.calls].some(c => c.method === 'PATCH')).toBe(false)
  })

  it('fails on a refused update, naming the call but neither the key nor the application', async () => {
    const w = world({ versions: [], patch: 400 })
    const error = await deployImage(w.options).catch((e: unknown) => e as Error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('bunny PATCH /apps/{id}/containers/c-1: HTTP 400')
  })

  it('stops waiting when bunny reports the application failing', async () => {
    const w = world({ versions: ['old-commit', 'old-commit'], statuses: ['active', 'progressing', 'failing'] })
    await expect(deployImage(w.options)).rejects.toThrow('bunny reports the application failing')
  })

  it('gives up when the new commit does not answer in time', async () => {
    const w = world({ versions: Array(20).fill('old-commit') })
    await expect(deployImage(w.options)).rejects.toThrow(`the panel still answers old-commit instead of ${TAG}`)
  })
})
