import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Pager } from '@/components/app/pager'
import { ROW_LINK } from '@/components/app/row-link'
import { formatDateTime } from '@/lib/intl'
import { letterContent } from '@/lib/letters'
import { pageQueryHref, parsePageQuery } from '@/lib/pagination'
import type { SearchParams } from '@/lib/search-params'
import { cn } from '@/lib/utils'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { listLetters } from '@/server/dal/outbox'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { letterSubject } from '@/server/mail/subject'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('outbox')
  return { title: t('title') }
}

/** Every letter the panel wrote (spec §9), newest first; owners and admins only. */
export default async function OutboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession()
  if (!can(session.role, 'outbox.read', session.workspaceKind)) notFound()
  const query = parsePageQuery(await searchParams)
  const { list, timeZone } = await withWorkspace(workspaceContext(session), async tx => ({
    list: await listLetters(tx, session.workspaceId, query),
    timeZone: (await getStoreSettings(tx, session.workspaceId)).timezone,
  }))
  if (list.total > 0 && query.page > list.pages) redirect(pageQueryHref('/outbox', query, { page: list.pages }))
  const locale = await getLocale()
  const t = await getTranslations('outbox')
  const letters = await Promise.all(list.rows.map(async row => {
    const content = letterContent(row.template, row.payload, timeZone)
    return { id: row.id, to: row.to, lang: content.locale, subject: await letterSubject(content), sent: formatDateTime(row.createdAt, locale, timeZone) }
  }))
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">{t('count', { total: list.total })}</p>
      </div>
      <p className="max-w-prose text-[13px] text-ink-2">{t('intro')}</p>
      <section className="rounded-lg border bg-card p-2 pb-3">
        {letters.length > 0 ? (
          <>
            <ul aria-label={t('title')} className="flex flex-col">
              {letters.map(letter => (
                <li key={letter.id} className="group/row relative flex flex-col gap-0.5 border-b px-3 py-3 last:border-b-0 hover:bg-secondary">
                  <Link href={`/outbox/${letter.id}`} prefetch={false} lang={letter.lang} className={cn(ROW_LINK, 'w-fit text-sm font-medium')}>{letter.subject}</Link>
                  <span className="text-xs wrap-anywhere text-muted-foreground tabular-nums">{t('toLine', { to: letter.to, sent: letter.sent })}</span>
                </li>
              ))}
            </ul>
            <Pager
              namespace="outbox.pager"
              sizeId="outbox-page-size"
              page={query.page}
              pages={list.pages}
              size={query.size}
              filtered={list.total}
              href={changes => pageQueryHref('/outbox', query, changes)}
            />
          </>
        ) : (
          <div className="flex flex-col items-start gap-1.5 px-3 py-8">
            <h2 className="font-sans text-base font-semibold">{t('empty.title')}</h2>
            <p className="text-[13px] text-muted-foreground">{t(session.workspaceKind === 'sandbox' ? 'empty.sandbox' : 'empty.owner')}</p>
          </div>
        )}
      </section>
    </div>
  )
}
