import { createServer, type Socket } from 'node:net'
import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { readiness } from '@/server/health'
import { adminPool, appPool, closeAll } from './db'

afterAll(closeAll)

describe('readiness', () => {
  it('passes with the app role through the pooler', async () => {
    expect(await readiness(appPool())).toEqual({ status: 'ok', db: 'ok', role: 'ok' })
  })

  it('fails on an over-privileged role', async () => {
    expect(await readiness(adminPool())).toEqual({ status: 'unavailable', failed: 'role' })
  })

  it('fails on a database that never answers, once its time is up', async () => {
    // A server that takes the connection and says nothing: the pool waits for its greeting until the readiness gives up.
    const sockets: Socket[] = []
    const silent = createServer(socket => { sockets.push(socket) })

    await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve))

    const port = (silent.address() as { port: number }).port
    const pool = new pg.Pool({ connectionString: `postgres://app:unused@127.0.0.1:${port}/none` })

    try {
      const started = Date.now()

      expect(await readiness(pool, 300)).toEqual({ status: 'unavailable', failed: 'db' })
      expect(Date.now() - started).toBeLessThan(2_000)
    } finally {
      for (const socket of sockets) {
        socket.destroy()
      }

      await pool.end().catch(() => undefined)
      await new Promise(resolve => silent.close(resolve))
    }
  })
})
