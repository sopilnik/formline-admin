import { describe, expect, it } from 'vitest'
import { isBreachedPassword, type Fetcher } from '@/server/auth/hibp'

// SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

function fake(body: string, status = 200): { fetcher: Fetcher; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = []
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, init })

    return new Response(body, { status })
  }

  return { fetcher, calls }
}

describe('isBreachedPassword', () => {
  it('sends only the first five characters of the SHA-1, with padding asked for', async () => {
    const { fetcher, calls } = fake('')

    await isBreachedPassword('password', { fetcher })
    expect(calls[0]?.url).toBe('https://api.pwnedpasswords.com/range/5BAA6')
    expect(new Headers(calls[0]?.init.headers).get('Add-Padding')).toBe('true')
  })

  it('reports a suffix that appears with a count', async () => {
    const { fetcher } = fake(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:9659365\r\n`)

    expect(await isBreachedPassword('password', { fetcher })).toBe(true)
  })

  it('ignores padding entries and absent suffixes', async () => {
    expect(await isBreachedPassword('password', { fetcher: fake(`${SUFFIX}:0\r\n`).fetcher })).toBe(false)
    expect(await isBreachedPassword('password', { fetcher: fake('0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n').fetcher })).toBe(false)
  })

  it('answers null, never blocking, when the service cannot be asked', async () => {
    expect(await isBreachedPassword('password', { fetcher: fake('', 503).fetcher })).toBeNull()
    expect(await isBreachedPassword('password', { fetcher: async () => { throw new TypeError('fetch failed') } })).toBeNull()

    const hanging: Fetcher = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })

    expect(await isBreachedPassword('password', { fetcher: hanging, timeoutMs: 20 })).toBeNull()
  })
})
