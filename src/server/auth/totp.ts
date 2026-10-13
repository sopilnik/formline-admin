import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { APP_NAME } from '@/lib/app'
import { decodeBase32IgnorePadding, decodeBase64urlIgnorePadding, encodeBase32UpperCaseNoPadding, encodeBase64urlNoPadding } from '@/lib/encoding'
import { createTOTPKeyURI, verifyHOTP } from '@/lib/otp'
import type { Keyring } from '@/server/config'

// SHA-1, 6 digits, 30 seconds — what every authenticator app accepts.
const PERIOD = 30
const DIGITS = 6
const CODE = new RegExp(`^\\d{${DIGITS}}$`)
export const TOTP_SECRET_BYTES = 20

export function generateTotpSecret(): Uint8Array {
  return new Uint8Array(randomBytes(TOTP_SECRET_BYTES))
}

/** The key as people type it: upper-case base32 in groups of four. */
export function formatTotpSecret(secret: Uint8Array): string {
  return encodeBase32UpperCaseNoPadding(secret).replace(/(.{4})(?=.)/g, '$1 ')
}

/** The key back from a form, ignoring spaces and case; null unless it is 20 bytes. */
export function parseTotpSecret(value: string): Uint8Array | null {
  try {
    const bytes = decodeBase32IgnorePadding(value.replace(/\s+/g, '').toUpperCase())
    return bytes.length === TOTP_SECRET_BYTES ? bytes : null
  } catch {
    return null
  }
}

export function totpUri(secret: Uint8Array, accountName: string): string {
  return createTOTPKeyURI(APP_NAME, accountName, secret, PERIOD, DIGITS)
}

/** Whether a code, its spaces removed, has the shape of an authenticator code rather than of a recovery code. */
export function isTotpShape(code: string): boolean {
  return CODE.test(code)
}

/**
 * Accepts the code of the current 30-second step or of one step either side, and
 * only a step later than the last accepted one, so every code works once.
 */
export function verifyTotp(secret: Uint8Array, code: string, lastStep: number | null, nowMs: number = Date.now()): { ok: true; step: number } | { ok: false } {
  const otp = code.replace(/\s+/g, '')
  if (!isTotpShape(otp)) return { ok: false }
  const current = Math.floor(nowMs / 1000 / PERIOD)
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue
    if (verifyHOTP(secret, BigInt(step), DIGITS, otp)) return { ok: true, step }
  }
  return { ok: false }
}

export type TotpBinding = { workspaceId: string; userId: string }

// The additional authenticated data ties a ciphertext to its user row: copied to
// another row it no longer decrypts.
const aad = (binding: TotpBinding): Buffer => Buffer.from(`${binding.workspaceId}${binding.userId}`)

/** AES-256-GCM with the current key: `<key id>.<iv>.<ciphertext>.<tag>`, the parts in base64url. */
export function encryptTotpSecret(secret: Uint8Array, binding: TotpBinding, keys: Keyring): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keys.keys.get(keys.current)!, iv, { authTagLength: 16 })
  cipher.setAAD(aad(binding))
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()])
  const part = (bytes: Uint8Array) => encodeBase64urlNoPadding(bytes)
  return `${keys.current}.${part(iv)}.${part(ciphertext)}.${part(cipher.getAuthTag())}`
}

export function decryptTotpSecret(value: string, binding: TotpBinding, keys: Keyring): Uint8Array {
  const [keyId = '', iv = '', ciphertext = '', tag = ''] = value.split('.')
  const key = keys.keys.get(keyId)
  if (!key) throw new Error('unknown TOTP key id')
  const decipher = createDecipheriv('aes-256-gcm', key, decodeBase64urlIgnorePadding(iv), { authTagLength: 16 })
  decipher.setAAD(aad(binding))
  decipher.setAuthTag(decodeBase64urlIgnorePadding(tag))
  return new Uint8Array(Buffer.concat([decipher.update(decodeBase64urlIgnorePadding(ciphertext)), decipher.final()]))
}
