export const PRODUCT_STATUSES = ['published', 'draft', 'archived'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

// Draft and published both ways, either of them to archived, archived back to draft.
const NEXT: Record<ProductStatus, readonly ProductStatus[]> = {
  published: ['draft', 'archived'],
  draft: ['published', 'archived'],
  archived: ['draft'],
}

export function isProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value)
}

export function nextProductStatuses(from: ProductStatus): readonly ProductStatus[] {
  return NEXT[from]
}

export function canTransitionProduct(from: ProductStatus, to: ProductStatus): boolean {
  return NEXT[from].includes(to)
}

/** Why a product cannot be deleted. */
export type DeleteBlocker = 'has_orders' | 'not_draft'

/**
 * Only a draft that no order line points at can be deleted; a product with orders is archived instead. Orders
 * come first: moving a product with orders to drafts would not make it deletable.
 */
export function deleteBlocker(status: ProductStatus, hasOrders: boolean): DeleteBlocker | null {
  if (hasOrders) return 'has_orders'
  return status === 'draft' ? null : 'not_draft'
}
