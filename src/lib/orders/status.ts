export const ORDER_STATUSES = ['paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** The statuses whose orders count as revenue. */
export const REVENUE_STATUSES: readonly OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered']

// Forward one step; cancel before shipping; refund any time after payment.
const NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['shipped', 'cancelled', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return NEXT[from]
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT[from].includes(to)
}

/** Canceling or refunding before the order shipped puts the posters back on the shelf; afterwards it does not. */
export function returnsStock(from: OrderStatus, to: OrderStatus): boolean {
  return (to === 'cancelled' || to === 'refunded') && (from === 'paid' || from === 'processing')
}

/** For the bulk menu: every transition valid for at least one of the statuses, in the order of ORDER_STATUSES. */
export function transitionsForAny(statuses: Iterable<OrderStatus>): OrderStatus[] {
  const allowed = new Set<OrderStatus>()

  for (const status of statuses) {
    for (const next of NEXT[status]) {
      allowed.add(next)
    }
  }

  return ORDER_STATUSES.filter(status => allowed.has(status))
}
