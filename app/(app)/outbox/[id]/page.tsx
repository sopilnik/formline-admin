import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { BackLink } from '@/components/app/detail-page'
import { LetterBody } from '@/components/outbox/letter'
import { formatDateTime } from '@/lib/intl'
import { letterContent } from '@/lib/letters'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { getLetter } from '@/server/dal/outbox'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { letterSubject } from '@/server/mail/subject'

type Params = { params: Promise<{ id: string }> }

const parseId = (value: string): string | null => {
  const id = z.uuid().safeParse(value)
  return id.success ? id.data : null
}

// The title and the page read the same letter: one set of queries per request. Only owners and admins read the outbox.
const load = cache(async (id: string) => {
  const session = await requireSession()
  if (!can(session.role, 'outbox.read', session.workspaceKind)) return null
  return withWorkspace(workspaceContext(session), async tx => {
    const letter = await getLetter(tx, session.workspaceId, id)
    if (!letter) return null
    return { letter, settings: await getStoreSettings(tx, session.workspaceId) }
  })
})

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await getTranslations('outbox.detail')
  const id = parseId((await params).id)
  const found = id === null ? null : await load(id)
  return { title: found ? await letterSubject(letterContent(found.letter.template, found.letter.payload, found.settings.timezone)) : t('notFoundTitle') }
}

/** One letter as its recipient would get it: who it is from and to, when, and what it says. */
export default async function LetterPage({ params }: Params) {
  const id = parseId((await params).id)
  const found = id === null ? null : await load(id)
  if (!found) notFound()
  const { letter, settings } = found
  const locale = await getLocale()
  const t = await getTranslations('outbox')
  const content = letterContent(letter.template, letter.payload, settings.timezone)
  const facts: [string, string][] = [
    [t('detail.from'), `${settings.storeName} <${settings.supportEmail}>`],
    [t('detail.to'), letter.to],
    [t('detail.sent'), formatDateTime(letter.createdAt, locale, settings.timezone)],
  ]
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <BackLink href="/outbox">{t('detail.back')}</BackLink>
      <h1 lang={content.locale} className="text-3xl font-bold tracking-tight break-words">{await letterSubject(content)}</h1>
      <article aria-labelledby="letter-facts" className="flex max-w-3xl min-w-0 flex-col gap-4 rounded-lg border bg-card p-5">
        <h2 id="letter-facts" className="sr-only">{t('detail.letter')}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-b pb-4 text-[13px]">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <LetterBody content={content} />
      </article>
    </div>
  )
}
