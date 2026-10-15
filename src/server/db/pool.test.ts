import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('getPool', () => {
  it('bounds the wait for a connection and listens for idle-client errors', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app:secret@127.0.0.1:1/none')

    const { getPool } = await import('@/server/db/pool')
    const pool = getPool()

    expect(pool.options.connectionTimeoutMillis).toBe(10_000)
    expect(pool.listenerCount('error')).toBe(1)
    await pool.end()
  })
})
