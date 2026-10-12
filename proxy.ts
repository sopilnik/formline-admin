import { isIP } from 'node:net'
import { NextResponse, type NextRequest } from 'next/server'
import { LOCALE_COOKIE } from '@/i18n/locale'
import { maintenancePage } from '@/lib/maintenance'
import { PREFERENCE_COOKIE_OPTIONS } from '@/lib/preference-cookie'
import { sameSecret } from '@/server/auth/tokens'

// The container is reachable only through the bunny edge, which sets both
// headers on every request and overwrites whatever a client sent. Anything
// without them came around the edge and is refused. This is not access
// control — that lives in the data access layer — it keeps the client IP
// trustworthy for rate limits and keeps the raw endpoint closed.
const LIVENESS = '/api/health'

export function buildCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

// Liveness alone, without a query: the readiness check (`?db=1`) reaches the database and comes through the edge like any page.
function isLiveness(request: NextRequest): boolean {
  return request.nextUrl.pathname === LIVENESS && request.nextUrl.search === ''
}

function fromEdge(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production' && process.env.ORIGIN_AUTH_DISABLED === '1') return true
  const secret = process.env.ORIGIN_AUTH_SECRET ?? ''
  const given = request.headers.get('x-origin-auth') ?? ''
  const ip = request.headers.get('x-client-ip') ?? ''
  return secret.length >= 32 && sameSecret(given, secret) && isIP(ip) !== 0
}

export function proxy(request: NextRequest): NextResponse {
  const requestId = crypto.randomUUID()
  const liveness = isLiveness(request)

  if (!liveness && !fromEdge(request)) {
    return new NextResponse('Forbidden', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
    })
  }

  // The container start sets the flag while the database is unreachable and restarts the server once it is back.
  if (!liveness && process.env.FORMLINE_MAINTENANCE === '1') {
    return new NextResponse(maintenancePage(request.cookies.get(LOCALE_COOKIE)?.value), {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '30',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        'X-Request-Id': requestId,
      },
    })
  }

  const lang = request.nextUrl.searchParams.get('lang')
  const locale = lang === 'en' || lang === 'ru' ? lang : null
  // The request that carries ?lang renders in that language already, not only the next one.
  if (locale) request.cookies.set(LOCALE_COOKIE, locale)

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development')
  const headers = new Headers(request.headers)
  if (locale) headers.set('cookie', request.cookies.toString())
  headers.set('x-nonce', nonce)
  headers.set('x-request-id', requestId)
  headers.set('Content-Security-Policy', csp)

  if (process.env.NODE_ENV === 'production') {
    // Behind the edge the Host header may name bunny's endpoint rather than the panel, and Server Actions compare the
    // browser's Origin with the forwarded host. The request passed the edge check, so the panel's own address stands in.
    const site = new URL(process.env.SITE_URL ?? 'http://localhost:3000')
    headers.set('x-forwarded-host', site.host)
    headers.set('x-forwarded-proto', site.protocol.replace(':', ''))
  }

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Request-Id', requestId)
  if (locale) response.cookies.set(LOCALE_COOKIE, locale, PREFERENCE_COOKIE_OPTIONS)
  return response
}

// Static build assets and the public poster images need neither a nonce nor the
// edge check: they are the same public files for everyone.
export const config = {
  matcher: ['/((?!_next/static|_next/image|posters/|favicon.ico).*)'],
}
