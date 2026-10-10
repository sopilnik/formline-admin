'use client'

import './globals.css'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { GLOBAL_ERROR_COPY, globalErrorLocale } from '@/lib/global-error-copy'

const subscribe = () => () => {}

// The root layout itself failed (spec §11, states): this page brings its own document, styles and words.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const locale = useSyncExternalStore(subscribe, () => globalErrorLocale(document.cookie), () => 'en' as const)
  const t = GLOBAL_ERROR_COPY[locale]
  return (
    <html lang={locale}>
      <body>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground">{t.body}</p>
          <Button type="button" onClick={() => retry()}>{t.retry}</Button>
        </main>
      </body>
    </html>
  )
}
