import { z } from 'zod'
import {
  COLLECTION_DESCRIPTION_MAX, COLLECTION_FIELDS, COLLECTION_NAME_MAX, COLLECTION_SLUG_MAX, type CollectionField, type CollectionInput,
  type CollectionIssue,
} from '@/lib/collections/fields'
import { isSlug, slugify } from '@/lib/slug'

// Server side only, like src/lib/products/form.ts: Zod stays out of the browser.

const issue = (error: CollectionIssue) => ({ error })

const schema = z.strictObject({
  name: z.string().trim().min(1, issue('name_required')).max(COLLECTION_NAME_MAX, issue('name_too_long')),
  slug: z.string().trim().toLowerCase(),
  description: z.string().trim().max(COLLECTION_DESCRIPTION_MAX, issue('description_too_long')),
})

export type CollectionResult = { ok: true; data: CollectionInput } | { ok: false; fieldErrors: Partial<Record<CollectionField, CollectionIssue>> }

/** The collection form: the slug comes from the name when it is left empty, as for products. */
export function parseCollection(input: Record<CollectionField, string>): CollectionResult {
  const fieldErrors: Partial<Record<CollectionField, CollectionIssue>> = {}
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    for (const problem of parsed.error.issues) {
      const field = problem.path[0]
      if (typeof field === 'string' && (COLLECTION_FIELDS as readonly string[]).includes(field)) fieldErrors[field as CollectionField] ??= problem.message as CollectionIssue
    }
  }
  const name = parsed.success ? parsed.data.name : input.name.trim()
  const slug = (parsed.success ? parsed.data.slug : input.slug.trim().toLowerCase()) || slugify(name, COLLECTION_SLUG_MAX)
  if (!fieldErrors.name && !isSlug(slug, COLLECTION_SLUG_MAX)) fieldErrors.slug = slug ? 'slug_invalid' : 'slug_required'
  if (!parsed.success || Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return { ok: true, data: { name, slug, description: parsed.data.description } }
}
