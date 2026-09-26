import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCsp, proxy } from './proxy'

const SECRET = 'x'.repeat(64)
const good = { 'x-origin-auth': SECRET, 'x-client-ip': '203.0.113.10' }
const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(`https://formline-admin.test${path}`, { headers })

afterEach(() => vi.unstubAllEnvs())

function production() {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('ORIGIN_AUTH_SECRET', SECRET)
}

describe('origin check', () => {
  it('lets the liveness probe through without the secret', () => {
    production()
    expect(proxy(req('/api/health')).status).toBe(200)
  })

  it.each([
    ['no headers', {}],
    ['a wrong secret', { ...good, 'x-origin-auth': 'y'.repeat(64) }],
    ['a secret of another length', { ...good, 'x-origin-auth': 'short' }],
    ['no client IP', { 'x-origin-auth': SECRET }],
    ['a client IP that is not an address', { ...good, 'x-client-ip': 'not-an-ip' }],
  ])('refuses %s with 403', (_name, headers) => {
    production()
    const res = proxy(req('/overview', headers))
    expect(res.status).toBe(403)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('accepts the edge headers', () => {
    production()
    expect(proxy(req('/overview', good)).status).toBe(200)
  })

  it('ignores ORIGIN_AUTH_DISABLED in production', () => {
    production()
    vi.stubEnv('ORIGIN_AUTH_DISABLED', '1')
    expect(proxy(req('/overview')).status).toBe(403)
  })

  it('honours ORIGIN_AUTH_DISABLED in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ORIGIN_AUTH_DISABLED', '1')
    expect(proxy(req('/overview')).status).toBe(200)
  })
})

describe('request decoration', () => {
  it('sets a fresh nonce CSP and request id on every response', () => {
    production()
    const a = proxy(req('/overview', good))
    const b = proxy(req('/overview', good))
    const csp = a.headers.get('content-security-policy') ?? ''
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
    expect(csp).not.toBe(b.headers.get('content-security-policy'))
    expect(a.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sets the language cookie from ?lang and ignores unknown values', () => {
    production()
    expect(proxy(req('/?lang=ru', good)).cookies.get('NEXT_LOCALE')?.value).toBe('ru')
    expect(proxy(req('/?lang=de', good)).cookies.get('NEXT_LOCALE')).toBeUndefined()
  })

  it('lets the request that carries ?lang render in that language already', () => {
    production()
    const res = proxy(req('/sign-in?lang=ru', { ...good, cookie: 'formline_theme=dark' }))
    const forwarded = res.headers.get('x-middleware-request-cookie') ?? ''
    expect(forwarded).toContain('NEXT_LOCALE=ru')
    expect(forwarded).toContain('formline_theme=dark')
  })
})

describe('buildCsp', () => {
  it('is the spec policy, with unsafe-eval only in development', () => {
    expect(buildCsp('n0nce', false)).toBe([
      "default-src 'self'",
      "script-src 'self' 'nonce-n0nce' 'strict-dynamic'",
      "style-src-elem 'self' 'nonce-n0nce'",
      "style-src-attr 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '))
    expect(buildCsp('n0nce', true)).toContain("'strict-dynamic' 'unsafe-eval'")
  })
})
