import { describe, expect, it } from 'vitest'
import {
  decodeBase32IgnorePadding,
  decodeBase64urlIgnorePadding,
  decodeHex,
  encodeBase32LowerCaseNoPadding,
  encodeBase32UpperCaseNoPadding,
  encodeBase64urlNoPadding,
  encodeHexLowerCase,
} from '@/lib/encoding'

const bytes = (text: string) => new TextEncoder().encode(text)

// RFC 4648 §10, without the padding.
const BASE32 = [['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']]

describe('base32', () => {
  it('encodes the RFC 4648 vectors in both cases', () => {
    for (const [plain, encoded] of BASE32) {
      expect(encodeBase32UpperCaseNoPadding(bytes(plain!))).toBe(encoded)
      expect(encodeBase32LowerCaseNoPadding(bytes(plain!))).toBe(encoded!.toLowerCase())
    }
  })

  it('decodes them back, with or without padding', () => {
    for (const [plain, encoded] of BASE32) {
      expect(decodeBase32IgnorePadding(encoded!)).toEqual(bytes(plain!))
    }

    expect(decodeBase32IgnorePadding('MZXW6===')).toEqual(bytes('foo'))
  })

  it('refuses other characters and lengths no input encodes to', () => {
    for (const text of ['mzxw6', 'MZXW1', 'MZ XW']) {
      expect(() => decodeBase32IgnorePadding(text), text).toThrow('Invalid character')
    }
    for (const text of ['M', 'MZX', 'MZXW6Y']) {
      expect(() => decodeBase32IgnorePadding(text), text).toThrow('Invalid padding')
    }

    // 'foo' ends in one unused bit: set, it is another spelling of the same bytes.
    expect(() => decodeBase32IgnorePadding('MZXW7')).toThrow('Invalid padding')
  })

  it('round-trips random keys', () => {
    for (let length = 0; length < 41; length++) {
      const key = crypto.getRandomValues(new Uint8Array(length))

      expect(decodeBase32IgnorePadding(encodeBase32UpperCaseNoPadding(key))).toEqual(key)
    }
  })
})

describe('base64url', () => {
  it('encodes without padding and decodes with or without it', () => {
    expect(encodeBase64urlNoPadding(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
    expect(decodeBase64urlIgnorePadding('-_8')).toEqual(new Uint8Array([0xfb, 0xff]))
    expect(decodeBase64urlIgnorePadding('-_8=')).toEqual(new Uint8Array([0xfb, 0xff]))
  })

  it('refuses what Buffer would skip silently', () => {
    for (const text of ['-_8!', '+/8', 'ab cd', 'abcde']) {
      expect(() => decodeBase64urlIgnorePadding(text), text).toThrow('Invalid base64url')
    }

    // Two bytes end in two unused bits: set, they are another spelling of the same bytes.
    expect(() => decodeBase64urlIgnorePadding('-_9')).toThrow('Invalid padding')
  })
})

describe('hex', () => {
  it('encodes lower case and decodes either case', () => {
    expect(encodeHexLowerCase(new Uint8Array([0, 171, 255]))).toBe('00abff')
    expect(decodeHex('00ABff')).toEqual(new Uint8Array([0, 171, 255]))
  })

  it('refuses odd lengths and other characters', () => {
    for (const text of ['abc', '0g', 'ab cd']) {
      expect(() => decodeHex(text), text).toThrow('Invalid hex')
    }
  })
})
