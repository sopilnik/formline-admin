// The product form's fields and limits, free of Zod so the browser can import them (src/lib/products/form.ts parses).
// The limits are the database checks' (migration 0003).
export const NAME_MAX = 120
export const PRODUCT_SLUG_MAX = 80
export const DESCRIPTION_MAX = 4000
export const TAGS_MAX = 12
export const TAG_MAX = 30

export const DETAIL_FIELDS = ['name', 'slug', 'collection', 'basePrice', 'tags', 'description'] as const
export type DetailField = (typeof DETAIL_FIELDS)[number]

/** Each field's problems; the keys of `products.form.errors` in the dictionaries. */
export type DetailIssue =
  | 'name_required' | 'name_too_long' | 'slug_required' | 'slug_invalid' | 'slug_taken' | 'collection_missing'
  | 'price_invalid' | 'tags_invalid' | 'description_too_long'

export type ProductDetails = { name: string; slug: string; collectionId: string; basePriceCents: number; tags: string[]; description: string }

/** The new-product form adds the palettes: each chosen one comes in every size (spec §8.3). */
export type NewProductField = DetailField | 'palettes'
export type NewProductIssue = DetailIssue | 'palettes_missing' | 'sku_taken'

// The variant form (spec §8.3): one row per variant, its fields named `<field>:<variant id>`.
export const STOCK_MAX = 100_000
export const THRESHOLD_MAX = 1_000
/** A store product has at most six palettes in three sizes. */
export const VARIANTS_MAX = 18
export const VARIANT_FIELDS = ['price', 'stock', 'threshold'] as const
export type VariantField = (typeof VARIANT_FIELDS)[number]
/** Each variant field's problem; the keys of `products.variants.errors` in the dictionaries. */
export type VariantIssue = 'price_invalid' | 'stock_invalid' | 'threshold_invalid'

export const variantFieldName = (field: VariantField | 'stockWas', variantId: string): string => `${field}:${variantId}`
