import 'server-only'
import pg from 'pg'
import { log } from '@/server/log'

let pool: pg.Pool | undefined

/**
 * One pool per process. Idle connections close after 10 s so Neon can scale to zero; a request waits at most 10 s for a
 * connection, a paused compute's wake-up included, rather than for ever.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is not set')
    pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 })
    // An idle client whose server went away (a suspended compute, a network fault) emits 'error'. The pool drops it and
    // connects anew on the next request; without a listener the event would be an uncaught exception.
    pool.on('error', error => log.warn({ event: 'db.idle_client_failed', err: error }))
  }
  return pool
}
