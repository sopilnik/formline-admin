import { describe, expect, it } from 'vitest'
import { checkPasswordShape, hashPassword, verifyAgainstDummy, verifyPassword } from '@/server/auth/passwords'

describe('password hashing', () => {
  it('uses Argon2id with the OWASP parameters', async () => {
    expect(await hashPassword('plum-kettle-sunrise-4471')).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  it('verifies the right password and refuses a wrong one or a broken hash', async () => {
    const hashed = await hashPassword('plum-kettle-sunrise-4471')

    expect(await verifyPassword(hashed, 'plum-kettle-sunrise-4471')).toBe(true)
    expect(await verifyPassword(hashed, 'plum-kettle-sunrise-4472')).toBe(false)
    expect(await verifyPassword('not-a-hash', 'plum-kettle-sunrise-4471')).toBe(false)
  })

  it('treats compatibility forms of the same text as the same password (NFKC)', async () => {
    const hashed = await hashPassword('ﬁrst-light-harbor')

    expect(await verifyPassword(hashed, 'first-light-harbor')).toBe(true)
  })

  it('spends a verification on unknown emails and always says no', async () => {
    expect(await verifyAgainstDummy('plum-kettle-sunrise-4471')).toBe(false)
  })
})

describe('checkPasswordShape', () => {
  it('asks for 12 to 128 characters and nothing else', () => {
    expect(checkPasswordShape('a'.repeat(11))).toBe('too_short')
    expect(checkPasswordShape('a'.repeat(12))).toBe('ok')
    expect(checkPasswordShape('a'.repeat(128))).toBe('ok')
    expect(checkPasswordShape('a'.repeat(129))).toBe('too_long')
  })

  it('counts characters, not UTF-16 units', () => {
    expect(checkPasswordShape('\u{1F512}'.repeat(12))).toBe('ok')
    expect(checkPasswordShape('\u{1F512}'.repeat(11))).toBe('too_short')
  })
})
