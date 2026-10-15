import { z } from 'zod'
import {
  DESCRIPTION_MAX, DETAIL_FIELDS, PRODUCT_NAME_MAX, PRODUCT_SLUG_MAX, TAG_MAX, TAGS_MAX, type DetailField, type DetailIssue, type ProductDetails,
} from '@/lib/products/fields'
import { PALETTE_IDS } from '@/lib/catalog'
import { parseBasePrice } from '@/lib/products/price'
import { isSlug, slugify } from '@/lib/slug'
import { cleanLine, cleanText } from '@/lib/text'

// Server side only: Zod checks whether it may compile code with `new Function`, which the
// Content Security Policy refuses in the browser. The fields import src/lib/products/fields.ts.

const TAG = /^[\p{Ll}\p{N}]+(-[\p{Ll}\p{N}]+)*$/u

/** "Bold, Type,  bold" → ['bold', 'type']: lowercase, spaces become hyphens, repeats dropped. Null when a tag is not a word. */
export function parseTags(text: string): string[] | null {
  const tags = text.split(',').map(tag => cleanLine(tag).toLocaleLowerCase().replace(/\s+/g, '-')).filter(Boolean)
  const unique = [...new Set(tags)]

  if (unique.length > TAGS_MAX || unique.some(tag => [...tag].length > TAG_MAX || !TAG.test(tag))) return null

  return unique
}

const issue = (error: DetailIssue) => ({ error })

// Every field arrives as text; unknown keys are refused.
const schema = z.strictObject({
  name: z.string().overwrite(cleanLine).min(1, issue('name_required')).max(PRODUCT_NAME_MAX, issue('name_too_long')),
  slug: z.string().trim().toLowerCase(),
  collection: z.uuid(issue('collection_missing')),
  basePrice: z.string(),
  tags: z.string(),
  description: z.string().overwrite(cleanText).max(DESCRIPTION_MAX, issue('description_too_long')),
})

export type DetailsResult = { ok: true; data: ProductDetails } | { ok: false; fieldErrors: Partial<Record<DetailField, DetailIssue>> }

/** The details form: the slug comes from the name when it is left empty. */
export function parseProductDetails(input: Record<DetailField, string>): DetailsResult {
  const fieldErrors: Partial<Record<DetailField, DetailIssue>> = {}
  const parsed = schema.safeParse(input)

  if (!parsed.success) {
    for (const problem of parsed.error.issues) {
      const field = problem.path[0]

      if (typeof field === 'string' && (DETAIL_FIELDS as readonly string[]).includes(field)) fieldErrors[field as DetailField] ??= problem.message as DetailIssue
    }
  }

  const basePriceCents = parseBasePrice(input.basePrice)

  if (basePriceCents === null) fieldErrors.basePrice = 'price_invalid'

  const tags = parseTags(input.tags)

  if (tags === null) fieldErrors.tags = 'tags_invalid'

  const name = parsed.success ? parsed.data.name : cleanLine(input.name)
  const typed = parsed.success ? parsed.data.slug : input.slug.trim().toLowerCase()
  const slug = typed || slugify(name, PRODUCT_SLUG_MAX)

  if (!fieldErrors.name && !isSlug(slug, PRODUCT_SLUG_MAX)) fieldErrors.slug = slug ? 'slug_invalid' : 'slug_required'
  if (!parsed.success || Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }

  return { ok: true, data: { name, slug, collectionId: parsed.data.collection, basePriceCents: basePriceCents!, tags: tags!, description: parsed.data.description } }
}

/** The palettes ticked on the new-product form, in the store's order; null when none of the store's is among them. */
export function parsePalettes(values: readonly string[]): string[] | null {
  const chosen = PALETTE_IDS.filter(id => values.includes(id))

  return chosen.length > 0 ? chosen : null
}
