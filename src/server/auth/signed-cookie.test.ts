import { describe, expect, it } from 'vitest'
import { signValue, verifySignedValue } from '@/server/auth/signed-cookie'

const KEY = 'k'.repeat(40)

describe('signed values', () => {
  it('round-trip their payload', () => {
    expect(verifySignedValue(signValue({ c: 'abc', e: 1 }, KEY), KEY)).toEqual({ c: 'abc', e: 1 })
  })

  it('refuse a changed payload, another key and garbage', () => {
    const value = signValue({ c: 'abc' }, KEY)
    const [, mac] = value.split('.')
    const forged = `${Buffer.from(JSON.stringify({ c: 'xyz' })).toString('base64url')}.${mac}`
    expect(verifySignedValue(forged, KEY)).toBeNull()
    expect(verifySignedValue(value, 'x'.repeat(40))).toBeNull()
    expect(verifySignedValue('garbage', KEY)).toBeNull()
    expect(verifySignedValue('a.b', KEY)).toBeNull()
  })
})
