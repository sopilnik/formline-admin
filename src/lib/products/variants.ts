import { z } from 'zod'
import { STOCK_MAX, THRESHOLD_MAX, VARIANTS_MAX, variantFieldName, type VariantField, type VariantIssue } from '@/lib/products/fields'
import { parsePrice } from '@/lib/products/price'

// Server side only, like src/lib/products/form.ts: Zod stays out of the browser.

export type VariantInput = {
  id: string
  /** The own price; null to sell at the base price plus the size's surcharge. */
  priceOverrideCents: number | null
  stock: number
  /** The stock the page showed when it was opened: a sale meanwhile must not be overwritten (spec §8.3). */
  stockWas: number
  lowStockThreshold: number
}

export type VariantErrors = Record<string, Partial<Record<VariantField, VariantIssue>>>
export type VariantsResult = { ok: true; rows: VariantInput[] } | { ok: false; errors: VariantErrors }

const count = (max: number) => z.string().trim().regex(/^\d{1,7}$/).transform(Number).pipe(z.number().int().max(max))
const ids = z.array(z.uuid()).min(1).max(VARIANTS_MAX)

/** The variant form: every listed variant's own price (empty for none), stock and threshold. Null ids mean a form that was tampered with. */
export function parseVariants(variantIds: readonly string[], text: (name: string) => string): VariantsResult | null {
  const parsedIds = ids.safeParse([...new Set(variantIds)])
  if (!parsedIds.success) return null
  const rows: VariantInput[] = []
  const errors: VariantErrors = {}
  for (const id of parsedIds.data) {
    const price = text(variantFieldName('price', id)).trim()
    const override = price === '' ? null : parsePrice(price)
    const stock = count(STOCK_MAX).safeParse(text(variantFieldName('stock', id)))
    const threshold = count(THRESHOLD_MAX).safeParse(text(variantFieldName('threshold', id)))
    const stockWas = count(Number.MAX_SAFE_INTEGER).safeParse(text(variantFieldName('stockWas', id)))
    if (!stockWas.success) return null
    const problems: Partial<Record<VariantField, VariantIssue>> = {}
    if (price !== '' && override === null) problems.price = 'price_invalid'
    if (!stock.success) problems.stock = 'stock_invalid'
    if (!threshold.success) problems.threshold = 'threshold_invalid'
    if (Object.keys(problems).length > 0) errors[id] = problems
    else rows.push({ id, priceOverrideCents: override, stock: stock.data!, stockWas: stockWas.data, lowStockThreshold: threshold.data! })
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, rows }
}
