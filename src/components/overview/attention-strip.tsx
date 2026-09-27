import { ArrowRight, CircleDollarSign, Package, TriangleAlert, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

type Counts = { toProcess: number; processing: number; soldOut: number }
type Part = { key: keyof Counts; href: string; icon: LucideIcon; tone: string }

const PARTS: Part[] = [
  { key: 'toProcess', href: '/orders?status=paid', icon: CircleDollarSign, tone: 'text-status-info' },
  { key: 'processing', href: '/orders?status=processing', icon: Package, tone: 'text-status-warn' },
  { key: 'soldOut', href: '/products?stock=out', icon: TriangleAlert, tone: 'text-status-bad' },
]

/** "What needs action now" (spec §8.1): up to three links; a part without work is left out, and so is the strip. */
export function AttentionStrip({ counts }: { counts: Counts }) {
  const t = useTranslations('overview.attention')
  const parts = PARTS.filter(part => counts[part.key] > 0)
  if (parts.length === 0) return null
  return (
    <nav aria-label={t('label')}>
      <ul className="flex flex-wrap gap-2.5">
        {parts.map(({ key, href, icon: Icon, tone }) => (
          <li key={key}>
            <Link
              href={href}
              prefetch={false}
              className="inline-flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-[13px] font-medium hover:bg-secondary"
            >
              <Icon aria-hidden className={`size-4 ${tone}`} />
              <span>{t.rich(key, { count: counts[key], b: chunks => <b className="font-brand text-[15px] font-bold tabular-nums">{chunks}</b> })}</span>
              <ArrowRight aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
