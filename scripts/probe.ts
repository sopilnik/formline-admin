// The probes of the hosting setup against the live panel, run by hand from .github/workflows/probe.yml. Each prints JSON
// lines of field names, figures, timings and statuses — never a key, a secret or the pull zone's raw hostnames — and exits 1
// when what it found contradicts the design.
//   p1 — usage: the fields of the summary, the statistics and the billing, and how old the newest statistics point is.
//   p2 — the edge: forged X-Origin-Auth and X-Client-IP are overwritten at the edge, and the pull zone's own hostnames refuse
//        a request with or without them, and the image optimizer.
//   p3 — the endpoint: its type and whether a pull zone carries it.
//   p4 — the cache: dynamic pages and /media never come from the edge's cache, built files do.
//   p5 — the database: readiness through the edge (the app role through Neon's pooler) and its time.
//   p6 — the demo: "Enter the demo" timed twice and ended.
import { fetchRawHosts } from './raw-hosts.ts'
import { demoChecks, OPTIMIZER_PATH, requestChecks } from './smoke.ts'

type Fetch = typeof fetch
type Log = (event: Record<string, unknown>) => void
type Bunny = (path: string) => Promise<Record<string, unknown>>

export const PROBES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const
export type Probe = (typeof PROBES)[number]

/** The newest point of bunny's time-keyed charts (`{ "<ISO time>": value }`), or null when none has one. */
export function newestPoint(charts: Record<string, unknown>): string | null {
  const times = Object.values(charts)
    .flatMap(chart => (chart && typeof chart === 'object' ? Object.keys(chart) : []))
    .filter(key => !Number.isNaN(Date.parse(key)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))

  return times.at(-1) ?? null
}

/** The type name of one value, telling null and arrays apart from objects. */
function typeName(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  return Array.isArray(value) ? 'array' : typeof value
}

/** The shape of an answer without its values: the field names and the type of each. */
export function shape(body: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeName(value)]))
}

export type ProbeOptions = { probe: Probe; siteUrl: string; bunny: Bunny; rawHosts: () => Promise<string[]>; fetch: Fetch; log: Log; now: () => number }

export async function runProbe(o: ProbeOptions): Promise<boolean> {
  const site = (path: string, headers?: Record<string, string>) =>
    o.fetch(new URL(path, o.siteUrl), { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) })

  switch (o.probe) {
    case 'p1': {
      // bunny answers the statistics only for a window and a granularity, both required: the last three hours by the
      // minute, so the newest point shows how far the figures lag behind.
      const from = new Date(o.now() - 3 * 60 * 60_000).toISOString()
      const statisticsPath = `/mc/apps/{id}/statistics?fromDate=${encodeURIComponent(from)}&granularity=Minute`

      const [app, summary, statistics, billing] = await Promise.all([o.bunny('/mc/apps/{id}'), o.bunny('/mc/apps/{id}/summary'), o.bunny(statisticsPath), o.bunny('/billing')])

      const newest = newestPoint(statistics)

      o.log({ probe: 'p1', status: app.status, summary: shape(summary), statistics: Object.keys(statistics), monthlyCost: summary.monthlyCost, magicContainers: billing.MonthlyChargesMagicContainers, newestPoint: newest, ageMinutes: newest ? Math.round((o.now() - Date.parse(newest)) / 60_000) : null })

      return typeof summary.monthlyCost === 'number' && typeof billing.MonthlyChargesMagicContainers === 'number'
    }

    case 'p2': {
      // Behind the edge a forged secret or address is replaced, so the answer is the ordinary one; were either passed on,
      // the panel would refuse with 403. The edge adds the secret on the panel's address only, so the pull zone's own
      // hostnames are refused with or without forged headers.
      const forged = { 'x-origin-auth': 'forged-'.padEnd(64, 'x'), 'x-client-ip': 'not-an-address', 'x-real-ip': '198.51.100.1' }
      const viaEdge = await site('/sign-in', forged)

      const hosts = await o.rawHosts()
      const status = (host: string, path: string, headers?: Record<string, string>) =>
        o.fetch(`https://${host}${path}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) }).then(r => r.status, () => null)
      const direct = await Promise.all(hosts.map(host => status(host, '/sign-in', forged)))
      const bare = await Promise.all(hosts.map(host => status(host, '/sign-in')))
      const image = await Promise.all(hosts.map(host => status(host, OPTIMIZER_PATH)))

      o.log({ probe: 'p2', viaEdgeWithForgedHeaders: viaEdge.status, rawHosts: hosts.length, rawWithForgedHeaders: direct, rawWithout: bare, rawImage: image })

      return viaEdge.status === 200 && hosts.length > 0 && [...direct, ...bare, ...image].every(code => code === 403)
    }

    case 'p3': {
      const { items } = (await o.bunny('/mc/apps/{id}/endpoints')) as { items?: { type?: string; pullZoneId?: string; publicHost?: string }[] }
      const endpoints = (items ?? []).map(e => ({ type: e.type, pullZone: Boolean(e.pullZoneId), publicHost: Boolean(e.publicHost) }))

      o.log({ probe: 'p3', endpoints })

      return endpoints.some(e => e.type === 'cdn' && e.pullZone)
    }

    case 'p4': {
      const checks = await requestChecks({ siteUrl: o.siteUrl, rawHosts: [], fetch: o.fetch })

      const html = await (await site('/sign-in')).text()
      const asset = html.match(/\/_next\/static\/[^"']+\.js/)?.[0]
      const first = asset ? await site(asset) : null
      const second = asset ? await site(asset) : null
      const cached = { check: 'built files come from the edge', ok: second?.headers.get('cdn-cache') === 'HIT', detail: `first ${first?.headers.get('cdn-cache') ?? 'none'}, second ${second?.headers.get('cdn-cache') ?? 'none'}` }

      const caching = checks.filter(c => c.kind === 'cache')

      for (const check of [...caching, cached]) {
        o.log({ probe: 'p4', ...check })
      }

      // An empty list would pass every(): without its cache checks the probe proves nothing.
      return caching.length > 0 && caching.every(c => c.ok) && cached.ok
    }

    case 'p5': {
      const started = o.now()
      const res = await site('/api/health?db=1')
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>

      o.log({ probe: 'p5', status: res.status, readiness: body, ms: o.now() - started })

      return res.status === 200 && body.role === 'ok'
    }

    case 'p6': {
      // The first entry may wake the database; the second shows the warm figure, which should stay under 3 s.
      const first = await demoChecks({ siteUrl: o.siteUrl })
      const second = await demoChecks({ siteUrl: o.siteUrl })

      for (const check of [...first, ...second]) {
        o.log({ probe: 'p6', ...check })
      }

      return [...first, ...second].every(c => c.ok)
    }
  }
}

if (import.meta.main) {
  const env = process.env
  const log: Log = event => console.log(JSON.stringify(event))
  const probe = env.PROBE as Probe

  if (!PROBES.includes(probe) || !env.SITE_URL || !env.BUNNY_API_KEY || !env.MC_APP_ID) {
    log({ probe: env.PROBE ?? null, ok: false, detail: `PROBE (${PROBES.join(', ')}), SITE_URL, BUNNY_API_KEY and MC_APP_ID are required` })
    process.exit(1)
  }

  const key = env.BUNNY_API_KEY
  const appId = env.MC_APP_ID
  const siteUrl = env.SITE_URL
  const bunny: Bunny = async path => {
    const res = await fetch(`https://api.bunny.net${path.replace('{id}', appId)}`, { headers: { AccessKey: key, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })

    if (!res.ok) {
      throw new Error(`bunny GET ${path}: HTTP ${res.status}`)
    }

    return (await res.json()) as Record<string, unknown>
  }
  const rawHosts = () => fetchRawHosts({ key, appId, siteUrl, fetch })

  runProbe({ probe, siteUrl, bunny, rawHosts, fetch, log, now: () => Date.now() }).then(
    ok => process.exit(ok ? 0 : 1),
    error => {
      log({ probe, ok: false, detail: error instanceof Error ? error.message : String(error) })
      process.exit(1)
    },
  )
}
