import { describe, expect, it } from 'vitest'
import { decide, runGuard, type GuardFacts } from './guard.ts'

const calm: GuardFacts = { status: 'active', appCost: 1.25, billingCost: 1.4, balance: 9.5, live: true }

describe('decide', () => {
  it('passes a month under the limit with money in the account and the panel answering', () => {
    expect(decide(calm)).toEqual({ undeploy: false, failures: [], cost: 1.4 })
  })

  it('undeploys at the limit, counting the larger of the two costs', () => {
    expect(decide({ ...calm, appCost: 3.2, billingCost: 4 })).toMatchObject({ undeploy: true, cost: 4 })
    expect(decide({ ...calm, appCost: 4.01, billingCost: 0.5 })).toMatchObject({ undeploy: true, cost: 4.01 })
    expect(decide({ ...calm, appCost: 3.99, billingCost: 3.99 })).toMatchObject({ undeploy: false })
  })

  it('fails without undeploying when a cost cannot be read, and still stops on the other at the limit', () => {
    expect(decide({ ...calm, appCost: undefined })).toEqual({ undeploy: false, failures: ['the usage summary carries no monthlyCost'], cost: 1.4 })
    expect(decide({ ...calm, appCost: 'n/a', billingCost: null })).toMatchObject({ undeploy: false, cost: null })
    expect(decide({ ...calm, appCost: null, billingCost: 4.5 })).toMatchObject({ undeploy: true, cost: 4.5 })
  })

  it('passes a balance between the floor and the top-up point, which the automatic top-up still has to reach', () => {
    expect(decide({ ...calm, balance: 2.99 }).failures).toEqual([])
    expect(decide({ ...calm, balance: 1 }).failures).toEqual([])
  })

  it('fails on a balance under $1 or unread, a suspended application and a silent panel', () => {
    expect(decide({ ...calm, balance: 0.99 }).failures).toEqual(['the balance $0.99 is under $1'])
    expect(decide({ ...calm, balance: undefined }).failures).toEqual(['the billing carries no Balance'])
    expect(decide({ ...calm, status: 'suspended' }).failures).toEqual(['bunny reports the application suspended'])
    expect(decide({ ...calm, live: false }).failures).toEqual(['the panel does not answer its liveness check'])
  })
})

type Call = { url: string; method: string; key: string | null }

function bunny(answers: Record<string, unknown>, health = 200) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    calls.push({ url, method, key: new Headers(init?.headers).get('AccessKey') })
    if (url.endsWith('/api/health')) return new Response('{"status":"ok"}', { status: health })

    const key = `${method} ${url.replace('https://api.bunny.net', '')}`

    if (!(key in answers)) return new Response('', { status: 404 })

    const body = answers[key]

    return body instanceof Response ? body : new Response(body === null ? '' : JSON.stringify(body), { status: 200 })
  }) as typeof fetch

  return { calls, fetchImpl }
}

const run = (fetchImpl: typeof fetch, events: Record<string, unknown>[]) =>
  runGuard({ key: 'test-account-key', appId: 'app-1', siteUrl: 'https://formline-admin.test', fetch: fetchImpl, log: e => { events.push(e) } })

describe('runGuard', () => {
  const healthy = {
    'GET /mc/apps/app-1': { status: 'active' },
    'GET /mc/apps/app-1/summary': { monthlyCost: 1.1 },
    'GET /billing': { MonthlyChargesMagicContainers: 1.2, Balance: 9 },
  }

  it('reads, finds nothing to do and passes', async () => {
    const { calls, fetchImpl } = bunny(healthy)
    const events: Record<string, unknown>[] = []

    expect(await run(fetchImpl, events)).toBe(0)
    expect(calls.filter(c => new URL(c.url).origin === 'https://api.bunny.net').every(c => c.key === 'test-account-key')).toBe(true)
    expect(calls.some(c => c.method === 'POST')).toBe(false)
    expect(events).toEqual([{ event: 'guard.checked', status: 'active', cost: 1.2, live: true, undeployed: false, failures: [] }])
  })

  it('undeploys at the limit and fails, so the owner hears of it', async () => {
    const { calls, fetchImpl } = bunny({ ...healthy, 'GET /mc/apps/app-1/summary': { monthlyCost: 4.2 }, 'POST /mc/apps/app-1/undeploy': null })

    expect(await run(fetchImpl, [])).toBe(1)
    expect(calls.filter(c => c.method === 'POST').map(c => c.url)).toEqual(['https://api.bunny.net/mc/apps/app-1/undeploy'])
  })

  it('leaves a stopped application alone and passes', async () => {
    const { calls, fetchImpl } = bunny({ 'GET /mc/apps/app-1': { status: 'inactive' } })
    const events: Record<string, unknown>[] = []

    expect(await run(fetchImpl, events)).toBe(0)
    expect(calls).toHaveLength(1)
    expect(events).toEqual([{ event: 'guard.stopped', status: 'inactive' }])
  })

  it('fails when bunny does not answer, naming the call but never the key or the application', async () => {
    const { fetchImpl } = bunny({ ...healthy, 'GET /billing': new Response('', { status: 503 }) })
    const events: Record<string, unknown>[] = []

    expect(await run(fetchImpl, events)).toBe(1)
    expect(events).toEqual([{ event: 'guard.failed', message: 'bunny GET /billing: HTTP 503' }])

    const missing = bunny({ 'GET /mc/apps/app-1': { status: 'active' } })
    const more: Record<string, unknown>[] = []

    expect(await run(missing.fetchImpl, more)).toBe(1)
    expect(JSON.stringify(more)).not.toContain('app-1')
    expect(JSON.stringify(more)).not.toContain('test-account-key')
  })

  it('fails when the panel is silent', async () => {
    const { fetchImpl } = bunny(healthy, 502)

    expect(await run(fetchImpl, [])).toBe(1)
  })
})
