import { describe, expect, it } from 'vitest'
import { newestPoint, runProbe, shape, type ProbeOptions } from './probe.ts'

describe('newestPoint', () => {
  it('finds the latest time across bunny\'s charts and ignores keys that are not times', () => {
    expect(newestPoint({
      cpuUsageChart: { '2026-10-04T10:00:00Z': 0.1, '2026-10-04T11:00:00Z': 0.2 },
      ramUsageChart: { '2026-10-04T10:30:00Z': 210 },
      label: 'not a chart',
      other: { notATime: 1 },
    })).toBe('2026-10-04T11:00:00Z')
    expect(newestPoint({})).toBeNull()
  })
})

describe('shape', () => {
  it('keeps the field names and their types, never the values', () => {
    expect(shape({ monthlyCost: 1.25, status: 'active', latencyChart: {}, regions: [], gone: null })).toEqual({
      monthlyCost: 'number', status: 'string', latencyChart: 'object', regions: 'array', gone: 'null',
    })
  })
})

describe('runProbe', () => {
  function options(probe: ProbeOptions['probe'], answers: Record<string, Record<string, unknown>>, site?: Response) {
    const events: Record<string, unknown>[] = []
    const o: ProbeOptions = {
      probe,
      siteUrl: 'https://formline-admin.test',
      bunny: async path => {
        if (!(path in answers)) throw new Error(`bunny GET ${path}: HTTP 404`)

        return answers[path]!
      },
      rawHosts: async () => [],
      fetch: (async () => site ?? new Response('', { status: 500 })) as typeof fetch,
      log: e => { events.push(e) },
      now: () => Date.parse('2026-10-04T12:00:00Z'),
    }

    return { o, events }
  }

  it('p1 prints the shapes, the two costs and how old the newest statistics point is', async () => {
    const { o, events } = options('p1', {
      '/mc/apps/{id}': { status: 'active' },
      '/mc/apps/{id}/summary': { monthlyCost: 0.42, averageLatency: 12 },
      // The window and the granularity bunny requires: the last three hours before the probe's now, by the minute.
      '/mc/apps/{id}/statistics?fromDate=2026-10-04T09%3A00%3A00.000Z&granularity=Minute': { cpuUsageChart: { '2026-10-04T11:45:00Z': 0.1 } },
      '/billing': { MonthlyChargesMagicContainers: 0.5, Balance: 9 },
    })

    expect(await runProbe(o)).toBe(true)
    expect(events).toEqual([{
      probe: 'p1', status: 'active', summary: { monthlyCost: 'number', averageLatency: 'number' }, statistics: ['cpuUsageChart'],
      monthlyCost: 0.42, magicContainers: 0.5, newestPoint: '2026-10-04T11:45:00Z', ageMinutes: 15,
    }])
    expect(JSON.stringify(events)).not.toContain('Balance')
  })

  it('p2 passes when the edge takes forged headers and every raw hostname refuses, and names no hostname', async () => {
    const hosts = ['mc-abc.b-cdn.net', 'mc-abc.bunny.run']
    const answering = (raw: number) =>
      (async (input: string | URL | Request) => new Response('', { status: String(input).startsWith('https://formline-admin.test/') ? 200 : raw })) as typeof fetch

    const refused = options('p2', {})

    refused.o.rawHosts = async () => hosts
    refused.o.fetch = answering(403)
    expect(await runProbe(refused.o)).toBe(true)
    expect(refused.events).toEqual([{
      probe: 'p2', viaEdgeWithForgedHeaders: 200, rawHosts: 2, rawWithForgedHeaders: [403, 403], rawWithout: [403, 403], rawImage: [403, 403],
    }])
    expect(JSON.stringify(refused.events)).not.toContain('mc-abc')

    const served = options('p2', {})

    served.o.rawHosts = async () => hosts
    served.o.fetch = answering(200)
    expect(await runProbe(served.o)).toBe(false)

    const none = options('p2', {}, new Response('', { status: 200 }))

    expect(await runProbe(none.o)).toBe(false)
  })

  it('p3 tells the endpoint\'s type and whether a pull zone carries it, without its hostname', async () => {
    const { o, events } = options('p3', { '/mc/apps/{id}/endpoints': { items: [{ type: 'cdn', pullZoneId: '6654999', publicHost: 'example.b-cdn.run' }] } })

    expect(await runProbe(o)).toBe(true)
    expect(events).toEqual([{ probe: 'p3', endpoints: [{ type: 'cdn', pullZone: true, publicHost: true }] }])
  })

  it('p4 checks the cache checks of the smoke test and the built files', async () => {
    const edge = (hits: string) => {
      let asset = 0

      return (async (input: string | URL | Request) => {
        const url = new URL(String(input))
        const noStore = { 'Cache-Control': 'private, no-store', 'CDN-Cache': 'MISS' }

        if (url.pathname.startsWith('/_next/static/')) return new Response('', { headers: { 'CDN-Cache': asset++ === 0 ? 'MISS' : hits } })
        if (url.pathname === '/sign-in') return new Response('<script src="/_next/static/chunks/app.js"></script>', { headers: noStore })
        if (url.pathname === '/api/health') return Response.json({ status: 'ok', db: 'ok', role: 'ok' })

        return new Response('', { status: 401, headers: noStore })
      }) as typeof fetch
    }
    const served = options('p4', {})

    served.o.fetch = edge('HIT')
    expect(await runProbe(served.o)).toBe(true)
    expect(served.events.map(e => e.check)).toEqual(['sign-in not cached', 'sign-in not cached on a second request', 'media not cached', 'built files come from the edge'])

    const missed = options('p4', {})

    missed.o.fetch = edge('MISS')
    expect(await runProbe(missed.o)).toBe(false)
  })

  it('p5 passes on readiness through the edge with the app role', async () => {
    const ready = options('p5', {}, Response.json({ status: 'ok', db: 'ok', role: 'ok' }))

    expect(await runProbe(ready.o)).toBe(true)
    expect(ready.events[0]).toMatchObject({ probe: 'p5', status: 200, readiness: { role: 'ok' } })

    const failed = options('p5', {}, Response.json({ status: 'unavailable', failed: 'role' }, { status: 503 }))

    expect(await runProbe(failed.o)).toBe(false)
  })
})
