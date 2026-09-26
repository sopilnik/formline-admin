import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'

// The CSP is per request (proxy.ts, it carries the nonce); these are the same for every response.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), publickey-credentials-get=(self), publickey-credentials-create=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // pino loads its transports at run time and @node-rs/argon2 is a native module; bundling breaks both.
  serverExternalPackages: ['pino', '@node-rs/argon2'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

// Languages without i18n routing: the locale comes from a cookie (spec §11), src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
