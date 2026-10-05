// The smoke test after every deploy (spec §13), run by deploy.yml against the live panel through the edge: liveness and
// readiness, the security headers of the sign-in page, nothing private served from the edge's cache, the pull zone's own
// bunny hostnames refusing a request that went around the panel's address, and "Enter the demo" timed, an image uploaded in the
// sandbox and read back — sharp and the storage zone at work in the container — and the demo ended, so the sandbox it
// opened is deleted at once. One JSON line per check; exit 1 when any fails.
import { chromium, type Page } from '@playwright/test'
import { fetchRawHosts } from './raw-hosts.ts'

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

/** A template product with a poster (spec §6.3); the upload replaces the poster inside the sandbox only. */
export const UPLOAD_PRODUCT = 'hush'
/** An 8 × 8 PNG, small enough to sit in the source; the panel re-encodes it to WebP like any upload. */
const UPLOAD_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWNYeXYTVsQwtCQA6aOKASzfMAMAAAAASUVORK5CYII='
const UPLOAD_CHECK = 'upload an image and read it back'

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

export type Served = { status: number; type: string | null; cache: string | null; edge: string | null }

/** An upload read back through /media: the panel's own WebP, private, never an answer of the edge's cache. */
export function imageServed(served: Served): Check {
  const ok = served.status === 200 && served.type === 'image/webp' && /no-store/.test(served.cache ?? '') && served.edge !== 'HIT'
  const detail = `HTTP ${served.status}, ${served.type ?? 'no type'}, cache-control ${served.cache ?? 'none'}, cdn-cache ${served.edge ?? 'none'}`
  return { check: UPLOAD_CHECK, ok, detail }
}

const firstLine = (error: unknown) => (error instanceof Error ? error.message.split('\n')[0] : String(error))

export type SmokeOptions = {
  siteUrl: string
  /** The pull zone's own hostnames besides the panel's address (bunny's `b-cdn.net` and `bunny.run` names); none skips their check. */
  rawHosts: string[]
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

  // The hostnames themselves stay out of the log: one numbered check each.
  for (const [index, host] of o.rawHosts.entries()) {
    const raw = await o.fetch(`https://${host}/sign-in`, { redirect: 'manual', signal: AbortSignal.timeout(20_000) }).catch(() => null)
    const check = `raw hostname ${index + 1} of ${o.rawHosts.length} refuses a request around the panel's address`
    checks.push({ check, ok: raw?.status === 403, detail: raw ? `HTTP ${raw.status}` : 'no answer' })
  }
  if (o.rawHosts.length === 0) checks.push({ check: 'raw hostnames refuse a request around the panel\'s address', ok: true, detail: 'skipped: no raw hostname' })
  return checks
}

/** An image uploaded to a product of the sandbox and read back through /media, as the browser would ask for it. */
async function uploadCheck(page: Page, siteUrl: string): Promise<Check> {
  await page.goto(new URL(`/products/${UPLOAD_PRODUCT}`, siteUrl).href)
  const card = page.getByRole('region', { name: 'Image' })
  await card.locator('input[type="file"]').setInputFiles({ name: 'smoke.png', mimeType: 'image/png', buffer: Buffer.from(UPLOAD_PNG, 'base64') })
  const shown = card.locator('img[src^="/media/"]')
  const refused = card.getByRole('alert')
  await shown.or(refused).first().waitFor({ timeout: 30_000 })
  if (await refused.isVisible()) return { check: UPLOAD_CHECK, ok: false, detail: (await refused.innerText()).trim() }
  const src = await shown.getAttribute('src')
  return imageServed(await page.evaluate(async url => {
    const response = await fetch(url)
    const header = (name: string) => response.headers.get(name)
    return { status: response.status, type: header('content-type'), cache: header('cache-control'), edge: header('cdn-cache') }
  }, src ?? ''))
}

/**
 * "Enter the demo" in a real browser, timed, and the sandbox ended at once by signing out; with `upload`, an image uploaded
 * and read back in between (the smoke test; the probes leave it out).
 */
export async function demoChecks(o: Pick<SmokeOptions, 'siteUrl' | 'headers'>, steps: { upload?: boolean } = {}): Promise<Check[]> {
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
    if (steps.upload) checks.push(await uploadCheck(page, o.siteUrl).catch(error => ({ check: UPLOAD_CHECK, ok: false, detail: firstLine(error) })))
    await page.getByRole('button', { name: /^Account menu: / }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.getByRole('dialog', { name: 'Sign out and end the demo?' }).getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL(url => url.pathname === '/sign-in', { timeout: 30_000 })
    checks.push({ check: 'end the demo', ok: true })
  } catch (error) {
    checks.push({ check: 'demo', ok: false, detail: firstLine(error) })
  } finally {
    await browser.close()
  }
  return checks
}

export async function smoke(o: SmokeOptions): Promise<Check[]> {
  return [...(await requestChecks(o)), ...(await demoChecks(o, { upload: true }))]
}

if (import.meta.main) {
  const env = process.env
  const log = (event: Record<string, unknown>) => console.log(JSON.stringify(event))
  const run = async (): Promise<number> => {
    if (!env.SITE_URL) throw new Error('SITE_URL is required')
    // Read from bunny's API, so the check of the raw hostnames needs no extra setting.
    const rawHosts = env.BUNNY_API_KEY && env.MC_APP_ID ? await fetchRawHosts({ key: env.BUNNY_API_KEY, appId: env.MC_APP_ID, siteUrl: env.SITE_URL, fetch }) : []
    // SMOKE_HEADERS stands in for the edge in a local run: a JSON object of request headers.
    const headers = env.SMOKE_HEADERS ? (JSON.parse(env.SMOKE_HEADERS) as Record<string, string>) : undefined
    const checks = await smoke({ siteUrl: env.SITE_URL, rawHosts, headers, fetch })
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
