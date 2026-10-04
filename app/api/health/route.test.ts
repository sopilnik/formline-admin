import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/health', () => {
  it('answers ok without touching the database and is never cached', async () => {
    const res = await GET(new Request('https://formline-admin.test/api/health'))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('names the image\'s commit when it has one', async () => {
    vi.stubEnv('FORMLINE_VERSION', '0123456789abcdef0123456789abcdef01234567')
    const res = await GET(new Request('https://formline-admin.test/api/health'))
    expect(await res.json()).toEqual({ status: 'ok', version: '0123456789abcdef0123456789abcdef01234567' })
  })
})
