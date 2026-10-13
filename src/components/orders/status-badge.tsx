import { CircleCheck, CircleDollarSign, CircleX, Package, Truck, Undo2, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { OrderStatus } from '@/lib/orders/status'
import { cn } from '@/lib/utils'

// A tinted pill with a text label and a per-status icon, so the six statuses stay
// apart without colour. Every text/background pair is in tests/unit/contrast.test.ts.
const LOOK: Record<OrderStatus, { icon: LucideIcon; className: string }> = {
  paid: { icon: CircleDollarSign, className: 'bg-badge-paid text-status-info' },
  processing: { icon: Package, className: 'bg-badge-processing text-status-warn' },
  shipped: { icon: Truck, className: 'bg-badge-shipped text-status-violet' },
  delivered: { icon: CircleCheck, className: 'bg-badge-delivered text-status-ok' },
  cancelled: { icon: CircleX, className: 'bg-badge-cancelled text-status-grey' },
  refunded: { icon: Undo2, className: 'bg-badge-refunded text-status-bad' },
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations('orders.status')
  const { icon: Icon, className } = LOOK[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-xs font-medium whitespace-nowrap', className)}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {t(status)}
    </span>
  )
}
