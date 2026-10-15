import 'server-only'
import { hash, verify } from '@node-rs/argon2'

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export type PasswordShape = 'ok' | 'too_short' | 'too_long'

// OWASP Password Storage Cheat Sheet: Argon2id (the library's default algorithm),
// m = 19 MiB, t = 2, p = 1. Spelled out so a dependency update cannot weaken them.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }

/** NFKC, so the same text typed on different keyboards is the same password (NIST SP 800-63B-4). */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC')
}

/** Length only, counted in characters; no composition rules. */
export function checkPasswordShape(password: string): PasswordShape {
  const length = [...normalizePassword(password)].length

  if (length < PASSWORD_MIN) {
    return 'too_short'
  }
  if (length > PASSWORD_MAX) {
    return 'too_long'
  }

  return 'ok'
}

export function hashPassword(password: string): Promise<string> {
  return hash(normalizePassword(password), OPTIONS)
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, normalizePassword(password))
  } catch {
    return false
  }
}

let dummy: Promise<string> | undefined

/**
 * Does the work of a real verification for an email that has no account, so the
 * response time does not tell which emails exist.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummy ??= hash('formline-admin-dummy-password', OPTIONS)
  await verifyPassword(await dummy, password)

  return false
}
