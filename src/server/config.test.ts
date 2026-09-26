import { describe, expect, it } from 'vitest'
import { authConfig, parseKeyring } from '@/server/config'

const K1 = Buffer.alloc(32, 1).toString('base64')
const K2 = Buffer.alloc(32, 2).toString('base64')

describe('parseKeyring', () => {
  it('encrypts with the first key and keeps every key for decryption', () => {
    const ring = parseKeyring(`k2:${K2},k1:${K1}`)
    expect(ring.current).toBe('k2')
    expect([...ring.keys.keys()]).toEqual(['k2', 'k1'])
    expect(ring.keys.get('k1')).toEqual(Buffer.alloc(32, 1))
  })

  it('refuses a key of the wrong length and a repeated id', () => {
    expect(() => parseKeyring(`k1:${Buffer.alloc(16).toString('base64')}`)).toThrow(/32 bytes/)
    expect(() => parseKeyring(`k1:${K1},k1:${K2}`)).toThrow(/repeated/)
  })
})

describe('authConfig', () => {
  it('derives the passkey relying party from SITE_URL', () => {
    const config = authConfig({
      DATABASE_URL: 'postgres://app:secret@127.0.0.1:56432/formline_dev',
      SITE_URL: 'https://formline-admin.sopilnik.dev',
      IP_HASH_KEY: 'i'.repeat(32),
      COOKIE_SIGNING_KEY: 'c'.repeat(32),
      TOTP_ENCRYPTION_KEYS: `k1:${K1}`,
    })
    expect(config.rpId).toBe('formline-admin.sopilnik.dev')
    expect(config.origin).toBe('https://formline-admin.sopilnik.dev')
    expect(config.setupToken).toBeNull()
    expect(config.totpKeys.current).toBe('k1')
  })
})
