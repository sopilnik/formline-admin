import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { DEFAULT_PERIOD, PERIODS, type Period } from '@/lib/periods'
import { cn } from '@/lib/utils'

/** The period selector: links, so it works with Back and without scripts. */
export function PeriodNav({ period }: { period: Period }) {
  const t = useTranslations('overview.periods')
  return (
    <nav aria-label={t('label')} className="max-w-full overflow-x-auto">
      <ul className="inline-flex gap-0.5 rounded-lg border border-input bg-card p-[3px]">
        {PERIODS.map(option => (
          <li key={option}>
            <Link
              href={option === DEFAULT_PERIOD ? '/overview' : `/overview?period=${option}`}
              aria-current={option === period ? 'page' : undefined}
              scroll={false}
              className={cn(
                'block rounded-[5px] px-3 py-1.5 text-[13px] whitespace-nowrap text-ink-2 hover:bg-muted hover:text-foreground',
                option === period && 'bg-selected text-selected-foreground hover:bg-selected hover:text-selected-foreground',
              )}
            >
              {t(option)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
