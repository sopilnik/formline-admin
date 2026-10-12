import type { Page } from '@playwright/test'
import { decodeBase32IgnorePadding } from '../../src/lib/encoding.ts'
import { generateHOTP } from '../../src/lib/otp.ts'

export type Totp = { secret: Uint8Array; lastStep: number }

/** The key the page shows for typing into an authenticator (the element #totp-secret). */
export async function readTotpSecret(page: Page): Promise<Uint8Array> {
  const text = (await page.locator('#totp-secret').textContent()) ?? ''
  return decodeBase32IgnorePadding(text.replace(/\s+/g, '').toUpperCase())
}

/**
 * A code the server still accepts: for the current step or the next, and later
 * than the last code used, since codes work once. Waits for the clock when needed.
 */
export async function codeFor(totp: Totp): Promise<string> {
  for (;;) {
    const now = Math.floor(Date.now() / 30_000)
    const step = Math.max(totp.lastStep + 1, now)
    if (step <= now + 1) {
      totp.lastStep = step
      return generateHOTP(totp.secret, BigInt(step), 6)
    }
    await new Promise(resolve => setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 250))
  }
}
