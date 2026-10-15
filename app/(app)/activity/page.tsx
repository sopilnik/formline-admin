import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { ActivityFilters } from '@/components/activity/activity-filters'
import { ActivityTable, type ActivityEntryView } from '@/components/activity/activity-table'
import { Pager } from '@/components/app/pager'
import { isActivityAction } from '@/lib/activity/actions'
import { describeEntry } from '@/lib/activity/describe'
import { activityHref, DEFAULT_ACTIVITY_QUERY, isActivityFiltered, parseActivityQuery } from '@/lib/activity/query'
import { formatDateTime } from '@/lib/intl'
import type { SearchParams } from '@/lib/search-params'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { titleFor } from '@/server/authz/page-title'
import { listActivity } from '@/server/dal/activity'
import { getStoreSettings } from '@/server/dal/settings'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('activity')

  return { title: await titleFor('activity.read', t('title')) }
}

/** The activity log: owners and admins; for other roles the address does not exist. */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession()

  if (!can(session.role, 'activity.read', session.workspaceKind)) notFound()

  const query = parseActivityQuery(await searchParams)
  const { log, timeZone } = await withWorkspace(workspaceContext(session), async tx => {
    const zone = (await getStoreSettings(tx, session.workspaceId)).timezone

    return { log: await listActivity(tx, session.workspaceId, { query, now: new Date(), timeZone: zone }), timeZone: zone }
  })

  if (log.filtered > 0 && query.page > log.pages) redirect(activityHref(query, { page: log.pages }))

  const locale = await getLocale()
  const t = await getTranslations('activity')
  const entries: ActivityEntryView[] = log.rows.map(row => ({
    id: row.id,
    at: formatDateTime(row.at, locale, timeZone),
    iso: row.at.toISOString(),
    actor: row.actorUserId ? (log.lookups.users.get(row.actorUserId) ?? t('formerMember')) : null,
    // An action the dictionaries do not know yet shows as it is written.
    action: isActivityAction(row.action) ? t(`actions.${row.action}`) : row.action,
    ...describeEntry(row, log.lookups),
  }))
  const filtered = isActivityFiltered(query)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
          {filtered ? t('countFiltered', { filtered: log.filtered, total: log.total }) : t('count', { total: log.total })}
        </p>
      </div>
      <ActivityFilters query={query} members={log.members} />
      <section className="@container rounded-lg border bg-card p-2 pb-3">
        {entries.length > 0 ? (
          <>
            <ActivityTable entries={entries} />
            <Pager
              namespace="activity.pager"
              sizeId="activity-page-size"
              page={query.page}
              pages={log.pages}
              size={query.size}
              filtered={log.filtered}
              href={changes => activityHref(query, changes)}
            />
          </>
        ) : (
          <div className="flex flex-col items-start gap-1.5 px-3 py-8">
            <h2 className="font-sans text-base font-semibold">{t('empty.title')}</h2>
            <p className="text-[13px] text-muted-foreground">{t('empty.body')}</p>
            {filtered ? (
              <Link href={activityHref(DEFAULT_ACTIVITY_QUERY, { size: query.size })} className="mt-2 text-[13px] font-medium text-primary hover:underline">
                {t('filters.clear')}
              </Link>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
