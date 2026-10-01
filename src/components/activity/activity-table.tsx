import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { Detail, Subject } from '@/lib/activity/describe'
import { cn } from '@/lib/utils'

/** One entry as the table receives it: the time formatted on the server, the action already a label. */
export type ActivityEntryView = { id: string; at: string; iso: string; actor: string | null; action: string; subject: Subject | null; detail: Detail | null }

const TH = 'h-10 border-b bg-card px-3 text-left font-medium whitespace-nowrap text-muted-foreground'
const TD = 'border-b px-3 py-2.5 align-top group-last/row:border-b-0'
const LINK = 'font-medium underline decoration-border-strong underline-offset-3 hover:decoration-current'

function SubjectText({ subject }: { subject: Subject | null }) {
  if (!subject) return null
  return subject.href ? <Link href={subject.href} prefetch={false} className={LINK}>{subject.text}</Link> : <span>{subject.text}</span>
}

type Translate = { (key: string): string; has: (key: string) => boolean }

/** The short detail in words; statuses, roles and field names in the interface language. */
function DetailText({ detail }: { detail: Detail | null }) {
  const t = useTranslations('activity.details')
  const order = useTranslations('orders.status')
  const product = useTranslations('products.status')
  const role = useTranslations('user.roles')
  const field = useTranslations('activity.fields')
  if (!detail) return null
  const label = (translate: Translate, value: string): string => (translate.has(value) ? translate(value) : value)
  switch (detail.kind) {
    case 'orderStatus':
    case 'productStatus':
    case 'role': {
      const translate = (detail.kind === 'orderStatus' ? order : detail.kind === 'productStatus' ? product : role) as unknown as Translate
      const text = t('transition', { from: label(translate, detail.from), to: label(translate, detail.to) })
      return <>{detail.kind === 'orderStatus' && detail.bulk ? t('inBulk', { transition: text }) : text}</>
    }
    case 'rows':
      return <>{detail.truncated ? t('rowsCut', { count: detail.count }) : t('rows', { count: detail.count })}</>
    case 'fields':
      return <>{t('fields', { fields: detail.fields.map(name => label(field as unknown as Translate, name)).join(', ') })}</>
    case 'variants':
      return <>{t('variants', { count: detail.count })}</>
    case 'image':
      return <>{t('image', { width: detail.width, height: detail.height })}</>
    case 'position':
      return <>{t('position', { from: detail.from, to: detail.to })}</>
    case 'invited':
      return <>{t('invited', { role: label(role as unknown as Translate, detail.role) })}</>
    case 'joined':
      return <>{t('joined', { role: label(role as unknown as Translate, detail.role) })}</>
    case 'method':
      return <>{t(`method.${detail.method}`)}</>
    case 'remaining':
      return <>{t('remaining', { count: detail.count })}</>
    case 'device':
      return <>{detail.device}</>
    case 'devices':
      return <>{t('devices', { count: detail.count })}</>
    case 'imported':
      return <>{t('imported', { count: detail.count })}</>
  }
}

/**
 * The log (spec §8.7): when, who, what, which entity (linked while it exists) and a detail — a table while the list is at
 * least 56 rem wide, cards below, as the other lists.
 */
export function ActivityTable({ entries }: { entries: ActivityEntryView[] }) {
  const t = useTranslations('activity')
  return (
    <>
      <table aria-label={t('title')} className="hidden w-full table-fixed border-separate border-spacing-0 text-[13px] @4xl:table">
        <colgroup>
          <col className="w-36" />
          <col className="w-44" />
          <col />
          <col />
          <col className="w-56" />
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <th scope="col" className={TH}>{t('columns.when')}</th>
            <th scope="col" className={TH}>{t('columns.who')}</th>
            <th scope="col" className={TH}>{t('columns.action')}</th>
            <th scope="col" className={TH}>{t('columns.subject')}</th>
            <th scope="col" className={TH}>{t('columns.details')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id} className="group/row">
              <td className={cn(TD, 'whitespace-nowrap text-ink-2 tabular-nums')}><time dateTime={entry.iso}>{entry.at}</time></td>
              <td className={cn(TD, 'break-words')}>{entry.actor ?? <span className="text-muted-foreground">{t('system')}</span>}</td>
              <td className={cn(TD, 'break-words')}>{entry.action}</td>
              <td className={cn(TD, 'break-words')}><SubjectText subject={entry.subject} /></td>
              <td className={cn(TD, 'break-words text-ink-2')}><DetailText detail={entry.detail} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={t('title')} className="flex flex-col @4xl:hidden">
        {entries.map(entry => (
          <li key={entry.id} className="flex flex-col gap-0.5 border-b px-3 py-3 text-[13px] last:border-b-0">
            <span className="font-medium break-words">{entry.action}</span>
            {entry.subject ? <span className="break-words"><SubjectText subject={entry.subject} /></span> : null}
            {entry.detail ? <span className="break-words text-ink-2"><DetailText detail={entry.detail} /></span> : null}
            <span className="text-xs text-muted-foreground tabular-nums">
              <time dateTime={entry.iso}>{entry.at}</time>
              {` · ${entry.actor ?? t('system')}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
