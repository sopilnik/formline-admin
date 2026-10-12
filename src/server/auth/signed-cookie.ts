import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { decodeBase64urlIgnorePadding, encodeBase64urlNoPadding } from '@/lib/encoding'

const mac = (body: string, key: string): Buffer => createHmac('sha256', key).update(body).digest()

/** `<payload>.<HMAC-SHA256>` in base64url: tamper-evident, not secret. */
export function signValue(payload: object, key: string): string {
  const body = encodeBase64urlNoPadding(new TextEncoder().encode(JSON.stringify(payload)))
  return `${body}.${encodeBase64urlNoPadding(mac(body, key))}`
}

/** The payload of a value this key signed; null when it was changed, signed elsewhere or is not one. */
export function verifySignedValue(value: string, key: string): unknown {
  const [body, signature, extra] = value.split('.')
  if (!body || !signature || extra !== undefined) return null
  try {
    const given = decodeBase64urlIgnorePadding(signature)
    const expected = mac(body, key)
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    return JSON.parse(new TextDecoder().decode(decodeBase64urlIgnorePadding(body))) as unknown
  } catch {
    return null
  }
}
