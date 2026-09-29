export const PRODUCT_STATUSES = ['published', 'draft', 'archived'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

// Spec §8.3: draft and published both ways, either of them to archived, archived back to draft.
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

/** Only a draft that no order line points at can be deleted (spec §8.3); a product with orders is archived instead. */
export function canDeleteProduct(status: ProductStatus, hasOrders: boolean): boolean {
  return status === 'draft' && !hasOrders
}
