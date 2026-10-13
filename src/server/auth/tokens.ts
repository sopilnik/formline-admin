import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { encodeBase32LowerCaseNoPadding } from '@/lib/encoding'

export const TOKEN_PATTERN = /^[a-z2-7]{32}$/

/** 20 random bytes as lower-case base32: 32 characters, 160 bits. */
export function generateToken(): string {
  return encodeBase32LowerCaseNoPadding(randomBytes(20))
}

/** The database stores only this hash of a token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
