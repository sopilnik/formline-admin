'use client'

import './globals.css'
import { useSyncExternalStore } from 'react'
import { ErrorDocument } from '@/components/app/error-document'
import { inter, spaceGrotesk } from '@/lib/fonts'
import { globalErrorLocale, globalErrorTheme } from '@/lib/global-error-copy'
import { themeClassName } from '@/lib/theme'
import { cn } from '@/lib/utils'

const subscribe = () => () => {}

// The root layout itself failed: this page brings its own document — the layout's fonts and the
// theme the visitor chose, read from the cookies on the client — and its own words.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = useSyncExternalStore(subscribe, () => globalErrorLocale(document.cookie), () => 'en' as const)
  const theme = useSyncExternalStore(subscribe, () => globalErrorTheme(document.cookie), () => 'system' as const)
  return <ErrorDocument locale={locale} className={cn(inter.variable, spaceGrotesk.variable, themeClassName(theme))} onRetry={() => retry()} />
}
