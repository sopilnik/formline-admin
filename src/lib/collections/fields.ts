// The collection form's fields and limits, free of Zod so the browser can import them
// (src/lib/collections/form.ts parses). The limits are the database checks' (migration 0003).
export const COLLECTION_NAME_MAX = 80
export const COLLECTION_SLUG_MAX = 60
export const COLLECTION_DESCRIPTION_MAX = 2000

export const COLLECTION_FIELDS = ['name', 'slug', 'description'] as const
export type CollectionField = (typeof COLLECTION_FIELDS)[number]

/** Each field's problems; the keys of `collections.form.errors` in the dictionaries. */
export type CollectionIssue = 'name_required' | 'name_too_long' | 'slug_required' | 'slug_invalid' | 'slug_taken' | 'description_too_long'

export type CollectionInput = { name: string; slug: string; description: string }
