// Base32 (RFC 4648 §6), base64url and hex for keys, tokens and signatures. Node's Buffer decodes base64url and hex
// leniently — it skips characters outside the alphabet and ignores the unused bits of the last character — so the
// decoders here throw on both: one value has one spelling, and a changed signature or ciphertext never reads the same.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function encodeBase32UpperCaseNoPadding(bytes: Uint8Array): string {
  let text = ''
  let buffer = 0
  let bits = 0

  for (const byte of bytes) {
    buffer = ((buffer & 31) << 8) | byte
    bits += 8

    while (bits >= 5) {
      bits -= 5
      text += BASE32[(buffer >> bits) & 31]
    }
  }

  if (bits > 0) {
    text += BASE32[(buffer << (5 - bits)) & 31]
  }

  return text
}

export function encodeBase32LowerCaseNoPadding(bytes: Uint8Array): string {
  return encodeBase32UpperCaseNoPadding(bytes).toLowerCase()
}

/** Upper-case base32 with or without its `=` padding; throws on any other character, a length no input encodes to, or set unused bits. */
export function decodeBase32IgnorePadding(text: string): Uint8Array<ArrayBuffer> {
  const data = text.replace(/=+$/, '')

  if ([1, 3, 6].includes(data.length % 8)) {
    throw new Error('Invalid padding')
  }

  const bytes = new Uint8Array(Math.floor((data.length * 5) / 8))
  let buffer = 0
  let bits = 0
  let index = 0

  for (const char of data) {
    const value = BASE32.indexOf(char)

    if (value === -1) {
      throw new Error('Invalid character')
    }

    buffer = (buffer << 5) | value
    bits += 5

    if (bits >= 8) {
      bits -= 8
      bytes[index++] = (buffer >> bits) & 0xff
      buffer &= (1 << bits) - 1
    }
  }

  if (buffer !== 0) {
    throw new Error('Invalid padding')
  }

  return bytes
}

export function encodeBase64urlNoPadding(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

/** Base64url with or without its `=` padding; throws on any other character, a length no input encodes to, or set unused bits. */
export function decodeBase64urlIgnorePadding(text: string): Uint8Array<ArrayBuffer> {
  const data = text.replace(/=+$/, '')

  if (!/^[A-Za-z0-9_-]*$/.test(data) || data.length % 4 === 1) {
    throw new Error('Invalid base64url')
  }

  const bytes = new Uint8Array(Buffer.from(data, 'base64url'))

  if (encodeBase64urlNoPadding(bytes) !== data) {
    throw new Error('Invalid padding')
  }

  return bytes
}

export function encodeHexLowerCase(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

export function decodeHex(text: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(text)) {
    throw new Error('Invalid hex')
  }

  return new Uint8Array(Buffer.from(text, 'hex'))
}
