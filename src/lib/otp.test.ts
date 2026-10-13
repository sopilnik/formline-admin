import { describe, expect, it } from 'vitest'
import { createTOTPKeyURI, generateHOTP, verifyHOTP } from '@/lib/otp'

const KEY = new TextEncoder().encode('12345678901234567890')

describe('generateHOTP', () => {
  it('gives the RFC 4226 appendix D codes for counters 0 to 9', () => {
    const codes = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489']
    expect(codes.map((_, counter) => generateHOTP(KEY, BigInt(counter), 6))).toEqual(codes)
  })

  it('gives the RFC 6238 appendix B SHA-1 codes at their times', () => {
    const vectors: [number, string][] = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]
    for (const [seconds, code] of vectors) expect(generateHOTP(KEY, BigInt(Math.floor(seconds / 30)), 8)).toBe(code)
  })
})

describe('verifyHOTP', () => {
  it('accepts the code of its counter only', () => {
    expect(verifyHOTP(KEY, 1n, 6, '287082')).toBe(true)
    expect(verifyHOTP(KEY, 2n, 6, '287082')).toBe(false)
    expect(verifyHOTP(KEY, 1n, 6, '28708')).toBe(false)
    expect(verifyHOTP(KEY, 1n, 6, '2870820')).toBe(false)
  })

  it('refuses six digits of another script instead of throwing', () => {
    expect(verifyHOTP(KEY, 1n, 6, '٢٨٧٠٨٢')).toBe(false)
  })
})

describe('createTOTPKeyURI', () => {
  it('writes the address the panel has always shown', () => {
    expect(createTOTPKeyURI('Formline Admin', 'owner', KEY, 30, 6)).toBe(
      'otpauth://totp/Formline%20Admin:owner?issuer=Formline+Admin&algorithm=SHA1&secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&period=30&digits=6')
    expect(createTOTPKeyURI('Formline Admin', 'a b@x.test', KEY, 30, 6)).toContain('/Formline%20Admin:a%20b%40x.test?')
  })
})
