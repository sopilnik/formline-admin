import { createHash } from 'node:crypto'

/**
 * A stable UUID (RFC 9562 version 8, custom) from a key: the same key gives the
 * same id on every build, which makes a rebuild an upsert and a sandbox copy able
 * to keep the template's ids.
 */
export function stableId(key: string): string {
  const bytes = createHash('sha256').update(`formline-admin:${key}`).digest().subarray(0, 16)

  bytes[6] = (bytes[6]! & 0x0f) | 0x80
  bytes[8] = (bytes[8]! & 0x3f) | 0x80

  const hex = bytes.toString('hex')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
