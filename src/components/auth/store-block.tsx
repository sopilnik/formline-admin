import { ArrowUpRight, Store } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { STORE_URL } from '@/lib/links'

/** The store this panel runs, at the top left of the sign-in pages. It opens a new tab, so the sign-in stays open. */
export async function StoreBlock() {
  const t = await getTranslations('auth.store')
  const common = await getTranslations('common')

  return (
    <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2.5 rounded-md">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card">
        <Store className="size-4" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="flex items-center gap-1 text-sm font-semibold group-hover:underline group-hover:underline-offset-3">
          {t('title')}
          <ArrowUpRight className="size-3.5 opacity-75" aria-hidden />
        </span>
        <span className="text-xs text-muted-foreground">{t('note')}</span>
      </span>
      <span className="sr-only">{common('newTab')}</span>
    </a>
  )
}
