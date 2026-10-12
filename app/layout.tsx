import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { Providers } from '@/components/app/providers'
import { APP_NAME } from '@/lib/app'
import { inter, spaceGrotesk } from '@/lib/fonts'
import { parseTheme, THEME_COOKIE, themeClassName } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { getNonce } from '@/server/request'
import './globals.css'

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  robots: { index: false, follow: false },
}

// Every page renders per request: the CSP nonce in proxy.ts requires it.
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  const nonce = await getNonce()
  const locale = await getLocale()
  const t = await getTranslations('common')
  return (
    <html lang={locale} className={cn(inter.variable, spaceGrotesk.variable, themeClassName(theme))}>
      <body>
        <NextIntlClientProvider>
          <Providers nonce={nonce} closeLabel={t('dismiss')} regionLabel={t('messages')}>
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
