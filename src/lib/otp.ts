// One-time codes: HOTP (RFC 4226) over the HMAC-SHA-1 of Node's crypto, and the key URI an authenticator app reads.
// TOTP (RFC 6238) is HOTP with the number of the current 30-second step as the counter; its window and replay guard
// live in src/server/auth/totp.ts.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { encodeBase32UpperCaseNoPadding } from './encoding.ts'

/** The code for `counter`: the HMAC-SHA-1 of the counter, cut by dynamic truncation to `digits` decimal digits. */
export function generateHOTP(key: Uint8Array, counter: bigint, digits: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(counter)
  const mac = createHmac('sha1', key).update(message).digest()

  const offset = mac[mac.length - 1]! & 0x0f
  const binary = mac.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 10 ** digits).padStart(digits, '0')
}

/** Whether `code` is the code for `counter`, compared in constant time. */
export function verifyHOTP(key: Uint8Array, counter: bigint, digits: number, code: string): boolean {
  if (code.length !== digits) return false
  return timingSafeEqual(Buffer.from(generateHOTP(key, counter, digits)), Buffer.from(code))
}

/** `otpauth://totp/<issuer>:<account>?…` with the key in base32 (Google's Key Uri Format). */
export function createTOTPKeyURI(issuer: string, accountName: string, key: Uint8Array, periodSeconds: number, digits: number): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`
  const query = new URLSearchParams({
    issuer,
    algorithm: 'SHA1',
    secret: encodeBase32UpperCaseNoPadding(key),
    period: String(periodSeconds),
    digits: String(digits),
  })
  return `otpauth://totp/${label}?${query}`
}
