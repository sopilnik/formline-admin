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
