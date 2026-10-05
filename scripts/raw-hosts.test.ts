import { describe, expect, it } from 'vitest'
import { fetchRawHosts, rawHostsOf } from './raw-hosts.ts'

const SITE = 'https://formline-admin.test'

describe('rawHostsOf', () => {
  it('keeps every hostname of the pull zone but the panel\'s own', () => {
    expect(rawHostsOf({
      Hostnames: [{ Value: 'mc-abc.b-cdn.net' }, { Value: 'mc-abc.bunny.run' }, { Value: 'Formline-Admin.test' }, { Value: '' }, { Value: null }],
    }, SITE)).toEqual(['mc-abc.b-cdn.net', 'mc-abc.bunny.run'])
    expect(rawHostsOf({ Hostnames: null }, SITE)).toEqual([])
    expect(rawHostsOf({}, SITE)).toEqual([])
  })
})

describe('fetchRawHosts', () => {
  function bunny(answers: Record<string, { status?: number; body: unknown }>) {
    const asked: { url: string; key: string | null }[] = []
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      asked.push({ url, key: new Headers(init?.headers).get('AccessKey') })
      const answer = answers[url.replace('https://api.bunny.net', '')]
      return answer ? Response.json(answer.body, { status: answer.status ?? 200 }) : new Response('', { status: 404 })
    }) as typeof globalThis.fetch

    return { fetch, asked }
  }

  it('reads the CDN endpoint\'s pull zone and returns its hostnames but the panel\'s', async () => {
    const { fetch, asked } = bunny({
      '/mc/apps/app1/endpoints': { body: { items: [{ type: 'anycast' }, { type: 'cdn', pullZoneId: '6700001', publicHost: 'formline-admin.test' }] } },
      '/pullzone/6700001': { body: { Hostnames: [{ Value: 'mc-abc.b-cdn.net' }, { Value: 'mc-abc.bunny.run' }, { Value: 'formline-admin.test' }] } },
    })
    expect(await fetchRawHosts({ key: 'k1', appId: 'app1', siteUrl: SITE, fetch })).toEqual(['mc-abc.b-cdn.net', 'mc-abc.bunny.run'])
    expect(asked).toEqual([
      { url: 'https://api.bunny.net/mc/apps/app1/endpoints', key: 'k1' },
      { url: 'https://api.bunny.net/pullzone/6700001', key: 'k1' },
    ])
  })

  it('returns none when no CDN endpoint has a pull zone', async () => {
    const { fetch, asked } = bunny({ '/mc/apps/app1/endpoints': { body: { items: [{ type: 'cdn', pullZoneId: null }] } } })
    expect(await fetchRawHosts({ key: 'k1', appId: 'app1', siteUrl: SITE, fetch })).toEqual([])
    expect(asked).toHaveLength(1)
  })

  it('names the failed call without the app or the zone', async () => {
    const endpoints = bunny({ '/mc/apps/app1/endpoints': { status: 401, body: {} } })
    await expect(fetchRawHosts({ key: 'k1', appId: 'app1', siteUrl: SITE, fetch: endpoints.fetch })).rejects.toThrow('bunny GET /mc/apps/{id}/endpoints: HTTP 401')

    const zone = bunny({ '/mc/apps/app1/endpoints': { body: { items: [{ type: 'cdn', pullZoneId: 6700001 }] } } })
    await expect(fetchRawHosts({ key: 'k1', appId: 'app1', siteUrl: SITE, fetch: zone.fetch })).rejects.toThrow('bunny GET /pullzone/{id}: HTTP 404')
  })
})
