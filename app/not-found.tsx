import { getTranslations } from 'next-intl/server'

// Next's own built-in 404 page injects an inline style with no CSP nonce; this
// replacement stays inside the site's stylesheet instead (spec §12.3).
export default async function NotFound() {
  const t = await getTranslations('notFound')
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
    </div>
  )
}
