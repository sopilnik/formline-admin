import { describe, expect, it } from 'vitest'
import { encodeBase64urlNoPadding } from '@/lib/encoding'
import { challengeCookie, handleFromUserId, readChallenge, userIdFromHandle } from '@/server/auth/passkeys'
import { authConfig } from '@/server/config'

const config = authConfig({
  DATABASE_URL: 'postgres://app:secret@127.0.0.1:56432/formline_dev',
  SITE_URL: 'http://localhost:4331',
  IP_HASH_KEY: 'i'.repeat(32),
  COOKIE_SIGNING_KEY: 'c'.repeat(32),
  TOTP_ENCRYPTION_KEYS: `k1:${Buffer.alloc(32, 1).toString('base64')}`,
})
const USER = '9b2f1c7e-5d3a-4c1b-8e2f-0a1b2c3d4e5f'
const NOW = 1_800_000_000_000

describe('user handles', () => {
  it('carry the user id as its 16 bytes', () => {
    const handle = handleFromUserId(USER)
    expect(handle).toHaveLength(16)
    expect(userIdFromHandle(encodeBase64urlNoPadding(handle))).toBe(USER)
  })

  it('refuse anything that is not 16 bytes of base64url', () => {
    expect(userIdFromHandle(undefined)).toBeNull()
    expect(userIdFromHandle(encodeBase64urlNoPadding(new Uint8Array(15)))).toBeNull()
    expect(userIdFromHandle('!!!')).toBeNull()
  })
})

describe('challenge cookies', () => {
  it('give the challenge back for their purpose within five minutes', () => {
    const cookie = challengeCookie('challenge-1', 'auth', undefined, config, NOW)
    expect(readChallenge(cookie, 'auth', undefined, config, NOW + 299_000)).toBe('challenge-1')
    expect(readChallenge(cookie, 'auth', undefined, config, NOW + 300_000)).toBeNull()
    expect(readChallenge(cookie, 'register', undefined, config, NOW)).toBeNull()
  })

  it('bind a registration challenge to its session', () => {
    const cookie = challengeCookie('challenge-2', 'register', 'session-a', config, NOW)
    expect(readChallenge(cookie, 'register', 'session-a', config, NOW)).toBe('challenge-2')
    expect(readChallenge(cookie, 'register', 'session-b', config, NOW)).toBeNull()
  })

  it('refuse a cookie signed with another key', () => {
    const other = { ...config, cookieSigningKey: 'x'.repeat(32) }
    expect(readChallenge(challengeCookie('challenge-3', 'auth', undefined, other, NOW), 'auth', undefined, config, NOW)).toBeNull()
  })
})
