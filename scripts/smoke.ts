// The smoke test after every deploy (spec §13), run by deploy.yml against the live panel through the edge: liveness and
// readiness, the security headers of the sign-in page, nothing private served from the edge's cache, the container's raw
// bunny hostname refusing a request that went around the edge, and "Enter the demo" timed and then ended, so the
// sandbox it opened is deleted at once. One JSON line per check; exit 1 when any fails.
import { chromium } from '@playwright/test'

export type Check = { check: string; ok: boolean; detail?: string }

export const SECURITY_HEADERS: Record<string, RegExp> = {
  'strict-transport-security': /max-age=\d+/,
  'content-security-policy': /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  'x-content-type-options': /^nosniff$/,
  'x-frame-options': /^DENY$/,
  'referrer-policy': /^strict-origin-when-cross-origin$/,
  'x-robots-tag': /noindex/,
}

/** "Enter the demo" may take longer than the 3 s of spec §1 here: the database may have slept until this deploy. */
export const DEMO_ENTRY_LIMIT_MS = 10_000

export function securityHeaders(headers: Headers): Check[] {
  return Object.entries(SECURITY_HEADERS).map(([name, pattern]) => {
    const value = headers.get(name)
    return { check: `header ${name}`, ok: value !== null && pattern.test(value), ...(value === null ? { detail: 'missing' } : {}) }
  })
}

/** A private answer: never a hit of the edge's cache (bunny's CDN-Cache header) and never storable. */
export function notCached(check: string, headers: Headers): Check {
  const edge = headers.get('cdn-cache')
  const control = headers.get('cache-control') ?? ''
  return { check, ok: edge !== 'HIT' && /no-store/.test(control), detail: `cdn-cache ${edge ?? 'none'}, cache-control ${control || 'none'}` }
}

export type SmokeOptions = {
  siteUrl: string
  /** The CDN endpoint's own hostname (bunny's `publicHost`); without it the check of the raw endpoint is skipped. */
  rawHost: string | null
  /** Headers every request carries: the edge's own in a local run, none behind the real edge. */
  headers?: Record<string, string>
  fetch: typeof fetch
}

/** Everything but the demo: plain requests, as a visitor's browser would send them through the edge. */
export async function requestChecks(o: SmokeOptions): Promise<Check[]> {
  const checks: Check[] = []
  const get = (path: string) => o.fetch(new URL(path, o.siteUrl), { headers: o.headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) })

  const live = await get('/api/health')
  checks.push({ check: 'liveness', ok: live.status === 200, detail: `HTTP ${live.status}` })
  const ready = await get('/api/health?db=1')
  const readiness = await ready.json().catch(() => null) as { db?: string; role?: string } | null
  checks.push({ check: 'readiness', ok: ready.status === 200 && readiness?.db === 'ok' && readiness?.role === 'ok', detail: `HTTP ${ready.status}` })

  const signIn = await get('/sign-in')
  checks.push({ check: 'sign-in page', ok: signIn.status === 200, detail: `HTTP ${signIn.status}` })
  checks.push(...securityHeaders(signIn.headers))
  checks.push(notCached('sign-in not cached', signIn.headers))
  checks.push(notCached('sign-in not cached on a second request', (await get('/sign-in')).headers))
  const media = await get('/media/00000000-0000-4000-8000-000000000000')
  checks.push({ check: 'media refused without a session', ok: media.status === 401, detail: `HTTP ${media.status}` })
  checks.push(notCached('media not cached', media.headers))

  if (o.rawHost) {
    const raw = await o.fetch(`https://${o.rawHost}/sign-in`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) }).catch(() => null)
    checks.push({ check: 'raw endpoint refuses a request around the edge', ok: raw?.status === 403, detail: raw ? `HTTP ${raw.status}` : 'no answer' })
  } else {
    checks.push({ check: 'raw endpoint refuses a request around the edge', ok: true, detail: 'skipped: no raw hostname' })
  }
  return checks
}

/** "Enter the demo" in a real browser, timed, and the sandbox ended at once by signing out. */
export async function demoChecks(o: Pick<SmokeOptions, 'siteUrl' | 'headers'>): Promise<Check[]> {
  const checks: Check[] = []
  const browser = await chromium.launch()
  try {
    const page = await (await browser.newContext({ extraHTTPHeaders: o.headers })).newPage()
    await page.goto(new URL('/sign-in', o.siteUrl).href)
    const started = Date.now()
    await page.getByRole('button', { name: 'Enter the demo' }).click()
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor({ timeout: 30_000 })
    const elapsed = Date.now() - started
    checks.push({ check: 'enter the demo', ok: elapsed < DEMO_ENTRY_LIMIT_MS, detail: `${elapsed} ms` })
    await page.getByRole('button', { name: /^Account menu: / }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.getByRole('dialog', { name: 'Sign out and end the demo?' }).getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL(url => url.pathname === '/sign-in', { timeout: 30_000 })
    checks.push({ check: 'end the demo', ok: true })
  } catch (error) {
    checks.push({ check: 'demo', ok: false, detail: error instanceof Error ? error.message.split('\n')[0] : String(error) })
  } finally {
    await browser.close()
  }
  return checks
}

export async function smoke(o: SmokeOptions): Promise<Check[]> {
  return [...(await requestChecks(o)), ...(await demoChecks(o))]
}

/** The CDN endpoint's hostname from bunny's API, so the raw-endpoint check needs no extra setting. */
async function rawHostOf(key: string, appId: string): Promise<string | null> {
  const res = await fetch(`https://api.bunny.net/mc/apps/${appId}/endpoints`, { headers: { AccessKey: key, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`bunny GET /apps/{id}/endpoints: HTTP ${res.status}`)
  const { items } = (await res.json()) as { items?: { type?: string; publicHost?: string }[] }
  return items?.find(item => item.type === 'cdn')?.publicHost ?? null
}

if (import.meta.main) {
  const env = process.env
  const log = (event: Record<string, unknown>) => console.log(JSON.stringify(event))
  const run = async (): Promise<number> => {
    if (!env.SITE_URL) throw new Error('SITE_URL is required')
    const rawHost = env.BUNNY_API_KEY && env.MC_APP_ID ? await rawHostOf(env.BUNNY_API_KEY, env.MC_APP_ID) : null
    // SMOKE_HEADERS stands in for the edge in a local run: a JSON object of request headers.
    const headers = env.SMOKE_HEADERS ? (JSON.parse(env.SMOKE_HEADERS) as Record<string, string>) : undefined
    const checks = await smoke({ siteUrl: env.SITE_URL, rawHost, headers, fetch })
    for (const check of checks) log(check)
    return checks.every(check => check.ok) ? 0 : 1
  }
  run().then(
    code => process.exit(code),
    error => {
      log({ check: 'smoke', ok: false, detail: error instanceof Error ? error.message : String(error) })
      process.exit(1)
    },
  )
}
