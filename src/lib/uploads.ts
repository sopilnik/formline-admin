// The upload route's terms, shared with the file picker (spec §8.4). The route checks the bytes
// themselves; the picker only saves a round trip for a file that could never pass.

/** The largest body the route reads: 2 MB. */
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024

/** What the file picker offers. */
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp'

/** The `error` of a refused upload; the keys of `products.image.errors` in the dictionaries. */
export type UploadError = 'unauthenticated' | 'forbidden' | 'invalid' | 'rate_limited' | 'too_large' | 'type' | 'pixels' | 'decode' | 'cap' | 'not_found' | 'unavailable'
