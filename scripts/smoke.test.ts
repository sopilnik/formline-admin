import { describe, expect, it } from 'vitest'
import { notCached, securityHeaders } from './smoke.ts'

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
