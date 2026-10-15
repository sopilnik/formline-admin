import { Button } from '@/components/ui/button'
import { GLOBAL_ERROR_COPY } from '@/lib/global-error-copy'

/** The document of the root error page: its own <html>, because the root layout that would give one has failed. */
export function ErrorDocument({ locale, className, onRetry }: { locale: keyof typeof GLOBAL_ERROR_COPY; className: string; onRetry: () => void }) {
  const t = GLOBAL_ERROR_COPY[locale]

  return (
    <html lang={locale} className={className}>
      <body>
        <title>{`${t.title} · Formline Admin`}</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground">{t.body}</p>
          <Button type="button" onClick={onRetry}>{t.retry}</Button>
        </main>
      </body>
    </html>
  )
}
