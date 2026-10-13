import { Archive, CircleCheck, PencilLine, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ProductStatus } from '@/lib/products/status'
import { cn } from '@/lib/utils'

// The order badges' pill, icon and colour pairs (every pair is in tests/unit/contrast.test.ts):
// published reads as done, a draft as work in progress, archived as put away.
const LOOK: Record<ProductStatus, { icon: LucideIcon; className: string }> = {
  published: { icon: CircleCheck, className: 'bg-badge-delivered text-status-ok' },
  draft: { icon: PencilLine, className: 'bg-badge-paid text-status-info' },
  archived: { icon: Archive, className: 'bg-badge-cancelled text-status-grey' },
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const t = useTranslations('products.status')
  const { icon: Icon, className } = LOOK[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-xs font-medium whitespace-nowrap', className)}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {t(status)}
    </span>
  )
}
