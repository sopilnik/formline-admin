import { expect, test } from './test.ts'
import { E2E_CLIENT_IP, E2E_ORIGIN_SECRET } from './constants.ts'

test('liveness answers without the origin secret', async ({ playwright, baseURL }) => {
  const bare = await playwright.request.newContext({ baseURL, extraHTTPHeaders: {} })
  const res = await bare.get('/api/health')

  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({ status: 'ok' })

  await bare.dispose()
})

for (const [name, headers] of [
  ['no edge headers', {}],
  ['a wrong secret', { 'x-origin-auth': 'wrong', 'x-client-ip': E2E_CLIENT_IP }],
  ['no client IP', { 'x-origin-auth': E2E_ORIGIN_SECRET }],
] as const) {
  test(`pages refuse a request with ${name}`, async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: headers })

    expect((await ctx.get('/')).status()).toBe(403)

    await ctx.dispose()
  })
}

test('pages carry the security headers and a per-request nonce the scripts use', async ({ request, page }) => {
  const a = await request.get('/sign-in')
  const b = await request.get('/sign-in')

  expect(a.status()).toBe(200)

  const h = a.headers()

  expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
  expect(h['content-security-policy']).not.toBe(b.headers()['content-security-policy'])
  expect(h['strict-transport-security']).toBe('max-age=63072000; includeSubDomains')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['x-robots-tag']).toBe('noindex, nofollow')
  expect(h['cross-origin-opener-policy']).toBe('same-origin')
  expect(h['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  expect(h['x-powered-by']).toBeUndefined()

  const violations: string[] = []

  page.on('console', m => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) {
      violations.push(m.text())
    }
  })

  const res = await page.goto('/sign-in')
  const nonce = /'nonce-([^']+)'/.exec(res?.headers()['content-security-policy'] ?? '')?.[1]
  const scriptNonces = await page.locator('script[nonce]').evaluateAll(els => els.map(e => (e as HTMLScriptElement).nonce))

  expect(scriptNonces.length).toBeGreaterThan(0)
  expect(new Set(scriptNonces)).toEqual(new Set([nonce]))
  expect(violations).toEqual([])
})

test('?lang=ru sets the language cookie and renders that request in Russian', async ({ request }) => {
  const res = await request.get('/sign-in?lang=ru')

  expect(res.headers()['set-cookie']).toMatch(/NEXT_LOCALE=ru/)
  expect(await res.text()).toContain('Вход')
})
