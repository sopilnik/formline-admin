import 'server-only'
import { createHash } from 'node:crypto'
import { normalizePassword } from '@/server/auth/passwords'
import { log } from '@/server/log'

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

/**
 * Have I Been Pwned, range API with k-anonymity: only the first five characters
 * of the password's SHA-1 leave the server, and padding hides the answer's size.
 * true = found in a breach, false = not found, null = the service could not be
 * asked; the check is then skipped and logged, never blocking.
 */
export async function isBreachedPassword(password: string, options: { fetcher?: Fetcher; timeoutMs?: number } = {}): Promise<boolean | null> {
  const { fetcher = fetch, timeoutMs = 3000 } = options
  const digest = createHash('sha1').update(normalizePassword(password)).digest('hex').toUpperCase()
  const prefix = digest.slice(0, 5)
  const suffix = digest.slice(5)
  try {
    const response = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'formline-admin' },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`status ${response.status}`)
    for (const line of (await response.text()).split('\n')) {
      const [candidate, count] = line.trim().split(':')
      if (candidate === suffix && Number(count) > 0) return true
    }
    return false
  } catch (error) {
    log.warn({ event: 'hibp.unavailable', err: error })
    return null
  }
}
