import { describe, expect, it } from 'vitest'
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from '@/server/auth/recovery-codes'

describe('recovery codes', () => {
  it('are ten distinct codes of ten base32 characters', () => {
    const codes = generateRecoveryCodes()

    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/)
  })

  it('accept the typed forms of a code', () => {
    expect(normalizeRecoveryCode(' ABCDE-FGHIJ ')).toBe('abcdefghij')
    expect(normalizeRecoveryCode('abcde fghij')).toBe('abcdefghij')
    expect(normalizeRecoveryCode('abcde')).toBeNull()
    expect(normalizeRecoveryCode('0bcdefghij')).toBeNull()
  })

  it('hash the same whatever the typed form', () => {
    expect(hashRecoveryCode('ABCDE-FGHIJ')).toBe(hashRecoveryCode('abcdefghij'))
    expect(hashRecoveryCode('abcdefghij')).toMatch(/^[0-9a-f]{64}$/)
  })
})
