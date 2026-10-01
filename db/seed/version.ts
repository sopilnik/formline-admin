/**
 * Bump on any change to the catalog snapshot or the generator; migrate rebuilds the template on a different value.
 * Version 2 charges express shipping as the store does: $19 at any amount (stage 8).
 */
export const TEMPLATE_VERSION = 2

/**
 * Generated rows are stored relative to this instant and shifted to the moment
 * of the copy, so the newest template order is minutes old in every fresh sandbox.
 */
export const TEMPLATE_EPOCH = new Date('2026-09-01T12:00:00Z')
