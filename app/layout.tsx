import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { Providers } from '@/components/app/providers'
import { parseTheme, THEME_COOKIE, themeClassName } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { getNonce } from '@/server/request'
import './globals.css'

// Inter carries Latin and Cyrillic in one file; Space Grotesk is Latin only
// (src/fonts/README.md).
const inter = localFont({
  src: '../src/fonts/InterVariable-latin-cyrillic.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = localFont({
  src: [
    { path: '../src/fonts/SpaceGrotesk-Regular-latin.woff2', weight: '400' },
    { path: '../src/fonts/SpaceGrotesk-Bold-latin.woff2', weight: '700' },
  ],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Formline Admin', template: '%s · Formline Admin' },
  robots: { index: false, follow: false },
}

// Every page renders per request: the CSP nonce in proxy.ts requires it.
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  const nonce = await getNonce()
  return (
    <html lang="en" className={cn(inter.variable, spaceGrotesk.variable, themeClassName(theme))}>
      <body>
        <Providers nonce={nonce} closeLabel="Dismiss">
          {children}
        </Providers>
      </body>
    </html>
  )
}
