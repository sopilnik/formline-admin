'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useOptimistic, useTransition } from 'react'
import { FilterSelect } from '@/components/app/filter-select'
import { ACTIVITY_GROUPS, type ActivityAction } from '@/lib/activity/actions'
import { activityHref, DEFAULT_ACTIVITY_QUERY, isActivityFiltered, SYSTEM_ACTOR, type ActivityQuery } from '@/lib/activity/query'
import { DATE_PRESETS, type DatePreset } from '@/lib/orders/query'

const mergeQuery = (current: ActivityQuery, changes: Partial<ActivityQuery>): ActivityQuery => ({ ...current, ...changes })

/** The log's filters (spec §8.7): who, which action and when, each a navigation, as the other lists' filters. */
export function ActivityFilters({ query, members }: { query: ActivityQuery; members: { id: string; name: string }[] }) {
  const t = useTranslations('activity.filters')
  const actions = useTranslations('activity.actions')
  const groups = useTranslations('activity.groups')
  const presets = useTranslations('orders.filters.placedOptions')
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [view, setView] = useOptimistic(query, mergeQuery)
  const go = (changes: Partial<ActivityQuery>): void => startTransition(() => {
    setView(changes)
    router.push(activityHref(view, changes), { scroll: false })
  })
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect id="activity-actor" label={t('actor')} value={view.actor} active={view.actor !== ''} onChange={event => go({ actor: event.target.value })}>
        <option value="">{t('actorAll')}</option>
        {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        <option value={SYSTEM_ACTOR}>{t('system')}</option>
      </FilterSelect>
      <FilterSelect id="activity-action" label={t('action')} value={view.action} active={view.action !== ''} onChange={event => go({ action: event.target.value as ActivityAction | '' })}>
        <option value="">{t('actionAll')}</option>
        {ACTIVITY_GROUPS.map(({ group, actions: list }) => (
          <optgroup key={group} label={groups(group)}>
            {list.map(action => <option key={action} value={action}>{actions(action)}</option>)}
          </optgroup>
        ))}
      </FilterSelect>
      <FilterSelect id="activity-when" label={t('when')} value={view.when} active={view.when !== DEFAULT_ACTIVITY_QUERY.when} onChange={event => go({ when: event.target.value as DatePreset })}>
        {DATE_PRESETS.map(preset => <option key={preset} value={preset}>{presets(preset)}</option>)}
      </FilterSelect>
      {isActivityFiltered(view) ? (
        <Link href={activityHref(DEFAULT_ACTIVITY_QUERY, { size: view.size })} scroll={false} className="ml-1 rounded-sm text-[13px] font-medium text-primary hover:underline">
          {t('clear')}
        </Link>
      ) : null}
    </div>
  )
}
