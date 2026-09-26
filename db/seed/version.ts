/** Bump on any change to the catalog snapshot or the generator; migrate rebuilds the template on a different value. */
export const TEMPLATE_VERSION = 1

/**
 * Generated rows are stored relative to this instant and shifted to the moment
 * of the copy, so the newest template order is minutes old in every fresh sandbox.
 */
export const TEMPLATE_EPOCH = new Date('2026-09-01T12:00:00Z')
