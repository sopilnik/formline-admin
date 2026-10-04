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
      rawHost: async () => null,
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
      '/mc/apps/{id}/statistics': { cpuUsageChart: { '2026-10-04T11:45:00Z': 0.1 } },
      '/billing': { MonthlyChargesMagicContainers: 0.5, Balance: 9 },
    })
    expect(await runProbe(o)).toBe(true)
    expect(events).toEqual([{
      probe: 'p1', status: 'active', summary: { monthlyCost: 'number', averageLatency: 'number' }, statistics: ['cpuUsageChart'],
      monthlyCost: 0.42, magicContainers: 0.5, newestPoint: '2026-10-04T11:45:00Z', ageMinutes: 15,
    }])
    expect(JSON.stringify(events)).not.toContain('Balance')
  })

  it('p3 tells the endpoint\'s type and whether a pull zone carries it, without its hostname', async () => {
    const { o, events } = options('p3', { '/mc/apps/{id}/endpoints': { items: [{ type: 'cdn', pullZoneId: '6654999', publicHost: 'example.b-cdn.run' }] } })
    expect(await runProbe(o)).toBe(true)
    expect(events).toEqual([{ probe: 'p3', endpoints: [{ type: 'cdn', pullZone: true, publicHost: true }] }])
  })

  it('p5 passes on readiness through the edge with the app role', async () => {
    const ready = options('p5', {}, Response.json({ status: 'ok', db: 'ok', role: 'ok' }))
    expect(await runProbe(ready.o)).toBe(true)
    expect(ready.events[0]).toMatchObject({ probe: 'p5', status: 200, readiness: { role: 'ok' } })
    const failed = options('p5', {}, Response.json({ status: 'unavailable', failed: 'role' }, { status: 503 }))
    expect(await runProbe(failed.o)).toBe(false)
  })
})
