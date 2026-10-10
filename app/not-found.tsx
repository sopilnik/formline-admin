import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound')
  return { title: t('title') }
}

// Next's own built-in 404 page injects an inline style with no CSP nonce; this
// replacement stays inside the site's stylesheet instead (spec §12.3). A signed-out
// visitor who follows the link is sent on to the sign-in page.
export default async function NotFound() {
  const t = await getTranslations('notFound')
  const nav = await getTranslations('nav')
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      <Link href="/overview" className="mt-2 text-[13px] font-medium text-primary hover:underline">{nav('overview')}</Link>
    </main>
  )
}
