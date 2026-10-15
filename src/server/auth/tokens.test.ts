import { describe, expect, it } from 'vitest'
import { generateToken, hashToken, sameSecret, TOKEN_PATTERN } from '@/server/auth/tokens'

describe('session tokens', () => {
  it('are 32 base32 characters, a fresh one every time', () => {
    const a = generateToken()
    const b = generateToken()

    expect(a).toMatch(TOKEN_PATTERN)
    expect(b).toMatch(TOKEN_PATTERN)
    expect(a).not.toBe(b)
  })

  it('are stored only as their SHA-256 in hex', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashToken(generateToken())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('compare secrets by value', () => {
    expect(sameSecret('abc', 'abc')).toBe(true)
    expect(sameSecret('abc', 'abd')).toBe(false)
    expect(sameSecret('abc', 'abcd')).toBe(false)
  })
})
