import { describe, expect, it } from 'vitest'
import { parseKeyring } from '@/server/config'
import { decryptTotpSecret, encryptTotpSecret, formatTotpSecret, generateTotpSecret, parseTotpSecret, totpUri, verifyTotp } from '@/server/auth/totp'

// RFC 6238, appendix B: the SHA-1 key "12345678901234567890"; at T = 59 s the
// eight-digit code is 94287082, so the six-digit code is 287082 (step 1).
const RFC_KEY = new TextEncoder().encode('12345678901234567890')
const ring = (value: string) => parseKeyring(value)
const K1 = Buffer.alloc(32, 1).toString('base64')
const K2 = Buffer.alloc(32, 2).toString('base64')
const binding = { workspaceId: '9b2f1c7e-5d3a-4c1b-8e2f-0a1b2c3d4e5f', userId: '0f1e2d3c-4b5a-4968-8776-655443322110' }

describe('TOTP secrets', () => {
  it('are 20 random bytes, shown as base32 in groups of four', () => {
    const secret = generateTotpSecret()
    expect(secret).toHaveLength(20)
    expect(formatTotpSecret(secret)).toMatch(/^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/)
    expect(generateTotpSecret()).not.toEqual(secret)
  })

  it('read back from a form ignoring spaces and case, and only at 20 bytes', () => {
    const secret = generateTotpSecret()
    expect(parseTotpSecret(formatTotpSecret(secret).toLowerCase())).toEqual(secret)
    expect(parseTotpSecret('ABCD')).toBeNull()
    expect(parseTotpSecret('!!!!')).toBeNull()
  })

  it('go into an otpauth URI with the issuer, the account and the code parameters', () => {
    const uri = new URL(totpUri(RFC_KEY, 'owner'))
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.searchParams.get('issuer')).toBe('Formline Admin')
    expect(uri.searchParams.get('algorithm')).toBe('SHA1')
    expect(uri.searchParams.get('digits')).toBe('6')
    expect(uri.searchParams.get('period')).toBe('30')
  })
})

describe('verifyTotp', () => {
  it('accepts the RFC 6238 vector and reports its step', () => {
    expect(verifyTotp(RFC_KEY, '287082', null, 59_000)).toEqual({ ok: true, step: 1 })
    expect(verifyTotp(RFC_KEY, '287 082', null, 59_000)).toEqual({ ok: true, step: 1 })
  })

  it('accepts one step either side and no further', () => {
    expect(verifyTotp(RFC_KEY, '287082', null, 59_000 + 30_000)).toEqual({ ok: true, step: 1 })
    expect(verifyTotp(RFC_KEY, '287082', null, 59_000 + 60_000)).toEqual({ ok: false })
  })

  it('refuses a step that is not later than the last accepted one', () => {
    expect(verifyTotp(RFC_KEY, '287082', 1, 59_000)).toEqual({ ok: false })
    expect(verifyTotp(RFC_KEY, '287082', 0, 59_000)).toEqual({ ok: true, step: 1 })
  })

  it('refuses anything but six digits', () => {
    expect(verifyTotp(RFC_KEY, '28708', null, 59_000)).toEqual({ ok: false })
    expect(verifyTotp(RFC_KEY, 'abcdef', null, 59_000)).toEqual({ ok: false })
  })
})

describe('TOTP secret encryption', () => {
  it('round-trips, prefixed with the key id', () => {
    const secret = generateTotpSecret()
    const sealed = encryptTotpSecret(secret, binding, ring(`k1:${K1}`))
    expect(sealed.split('.')).toHaveLength(4)
    expect(sealed.startsWith('k1.')).toBe(true)
    expect(decryptTotpSecret(sealed, binding, ring(`k1:${K1}`))).toEqual(secret)
    expect(encryptTotpSecret(secret, binding, ring(`k1:${K1}`))).not.toBe(sealed)
  })

  it('decrypts with an older key after a rotation', () => {
    const secret = generateTotpSecret()
    const sealed = encryptTotpSecret(secret, binding, ring(`k1:${K1}`))
    expect(decryptTotpSecret(sealed, binding, ring(`k2:${K2},k1:${K1}`))).toEqual(secret)
  })

  it('cannot be moved to another user row or tampered with', () => {
    const sealed = encryptTotpSecret(generateTotpSecret(), binding, ring(`k1:${K1}`))
    const keys = ring(`k1:${K1}`)
    // AES-GCM refuses both: the user row is part of the authenticated data, and the tag covers the ciphertext.
    expect(() => decryptTotpSecret(sealed, { ...binding, userId: binding.workspaceId }, keys)).toThrow('unable to authenticate data')
    const [id, iv, data, tag] = sealed.split('.')
    // The first character: all its six bits are the ciphertext's, while the last may hold unused ones the decoder refuses first.
    const flipped = `${data!.startsWith('A') ? 'B' : 'A'}${data!.slice(1)}`
    expect(() => decryptTotpSecret([id, iv, flipped, tag].join('.'), binding, keys)).toThrow('unable to authenticate data')
    expect(() => decryptTotpSecret(sealed, binding, ring(`k2:${K2}`))).toThrow('unknown TOTP key id')
  })
})
