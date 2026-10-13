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
  // `next dev` writes no rules file of its own into the repository.
  agentRules: false,
  // Metadata arrives with the page for every browser, not streamed after it: a streamed title left the tab without one for
  // up to 0.3 s after a refresh or a navigation. A page and its title read the same cached query, so nothing waits
  // longer, and the panel is never indexed, so there is no crawler to tell apart.
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  // Every image is served as it is, so the image optimiser stays off: /_next/image would otherwise resize public files
  // for anyone who asked, on the pull zone's own hostnames too.
  images: { unoptimized: true },
  // pino loads its transports at run time and @node-rs/argon2 is a native module; bundling breaks both.
  serverExternalPackages: ['pino', '@node-rs/argon2'],
  experimental: {
    // proxy.ts sees every request, so Next.js keeps a copy of each body for it, by default up to 10 MB, and cuts the rest.
    // An upload may be 2 MB: 3 MB keeps the copy small while the media route still refuses anything larger.
    proxyClientMaxBodySize: '3mb',
    // A page visited in the last minute opens again from the browser's memory instead of asking the server. An own
    // change still shows at once: every save clears this memory — the action's refresh() or revalidatePath(), or the
    // client's router.refresh() after it moves to a new address (tests/e2e/client-cache.spec.ts).
    staleTimes: { dynamic: 60 },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

// Languages without i18n routing: the locale comes from a cookie, src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
