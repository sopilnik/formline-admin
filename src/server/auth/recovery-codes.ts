import 'server-only'
import { randomBytes } from 'node:crypto'
import { encodeBase32LowerCaseNoPadding } from '@/lib/encoding'
import { hashToken } from '@/server/auth/tokens'

export const RECOVERY_CODE_COUNT = 10

/** Ten codes of ten base32 characters (50 bits each), shown as `abcde-fghij` (spec §5.3). */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const code = encodeBase32LowerCaseNoPadding(randomBytes(7)).slice(0, 10)
    return `${code.slice(0, 5)}-${code.slice(5)}`
  })
}

/** Lower case without spaces or dashes; null unless it has the shape of a code. */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.toLowerCase().replace(/[\s-]/g, '')
  return /^[a-z2-7]{10}$/.test(code) ? code : null
}

/** Stored as SHA-256; the shown and the typed forms of a code hash the same. */
export function hashRecoveryCode(code: string): string {
  return hashToken(code.toLowerCase().replace(/[\s-]/g, ''))
}
