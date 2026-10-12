/** A collection's page is addressed by its slug, as a product's is. */
export function collectionHref(slug: string): string {
  return `/collections/${slug}`
}
