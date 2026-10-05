import { describe, expect, it } from 'vitest'
import { imageServed, notCached, requestChecks, securityHeaders } from './smoke.ts'

const good = new Headers({
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-abc123' 'strict-dynamic'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Robots-Tag': 'noindex, nofollow',
})

describe('securityHeaders', () => {
  it('passes the panel\'s headers and names a missing or weakened one', () => {
    expect(securityHeaders(good).every(c => c.ok)).toBe(true)
    const weak = new Headers(good)
    weak.delete('X-Frame-Options')
    weak.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'")
    expect(securityHeaders(weak).filter(c => !c.ok)).toEqual([
      { check: 'header content-security-policy', ok: false },
      { check: 'header x-frame-options', ok: false, detail: 'missing' },
    ])
  })
})

describe('notCached', () => {
  it('passes a private answer the edge passed through and fails a cache hit or a storable answer', () => {
    expect(notCached('page', new Headers({ 'CDN-Cache': 'BYPASS', 'Cache-Control': 'private, no-store' })).ok).toBe(true)
    expect(notCached('page', new Headers({ 'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate' })).ok).toBe(true)
    expect(notCached('page', new Headers({ 'CDN-Cache': 'HIT', 'Cache-Control': 'private, no-store' })).ok).toBe(false)
    expect(notCached('page', new Headers({ 'CDN-Cache': 'MISS', 'Cache-Control': 'public, max-age=60' })).ok).toBe(false)
  })
})

describe('imageServed', () => {
  it('passes the panel\'s private WebP read back from a sandbox and fails anything else', () => {
    const webp = { status: 200, type: 'image/webp', cache: 'private, no-store', edge: 'BYPASS' }
    expect(imageServed(webp)).toEqual({
      check: 'upload an image and read it back', ok: true, detail: 'HTTP 200, image/webp, cache-control private, no-store, cdn-cache BYPASS',
    })
    expect(imageServed({ ...webp, edge: null }).ok).toBe(true)
    expect(imageServed({ ...webp, edge: 'HIT' }).ok).toBe(false)
    expect(imageServed({ ...webp, cache: 'public, max-age=60' }).ok).toBe(false)
    expect(imageServed({ ...webp, status: 404, type: 'text/html; charset=utf-8' }).ok).toBe(false)
  })
})

describe('requestChecks', () => {
  const SITE = 'https://formline-admin.test'
  // The panel behind the edge: its own address serves, any other hostname is refused as the panel refuses a request without
  // the edge's secret.
  const panel = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.hostname !== 'formline-admin.test') return new Response('Forbidden', { status: 403 })
    if (url.pathname === '/api/health') return Response.json(url.search ? { status: 'ok', db: 'ok', role: 'ok' } : { status: 'ok' })
    const noStore = { 'Cache-Control': 'private, no-store' }
    if (url.pathname === '/sign-in') return new Response('', { headers: { ...Object.fromEntries(good), ...noStore } })
    return new Response('', { status: 401, headers: noStore })
  }) as typeof fetch

  it('checks every raw hostname in a check of its own without naming it, and skips the check without any', async () => {
    const checks = await requestChecks({ siteUrl: SITE, rawHosts: ['mc-abc.b-cdn.net', 'mc-abc.bunny.run'], fetch: panel })
    expect(checks.every(c => c.ok)).toBe(true)
    expect(checks.filter(c => c.check.startsWith('raw hostname'))).toEqual([
      { check: 'raw hostname 1 of 2 refuses a request around the panel\'s address', ok: true, detail: 'HTTP 403' },
      { check: 'raw hostname 2 of 2 refuses a request around the panel\'s address', ok: true, detail: 'HTTP 403' },
    ])
    expect(JSON.stringify(checks)).not.toContain('mc-abc')

    const none = await requestChecks({ siteUrl: SITE, rawHosts: [], fetch: panel })
    expect(none.at(-1)).toEqual({ check: 'raw hostnames refuse a request around the panel\'s address', ok: true, detail: 'skipped: no raw hostname' })
  })

  it('fails a raw hostname that serves the panel', async () => {
    const open = (async (input: string | URL | Request) => panel(String(input).replace('mc-abc.bunny.run', 'formline-admin.test'))) as typeof fetch
    const checks = await requestChecks({ siteUrl: SITE, rawHosts: ['mc-abc.bunny.run'], fetch: open })
    expect(checks.find(c => c.check.startsWith('raw hostname 1'))).toMatchObject({ ok: false, detail: 'HTTP 200' })
  })
})
