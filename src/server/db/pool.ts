import 'server-only'
import pg from 'pg'

let pool: pg.Pool | undefined

/** One pool per process. Idle connections close after 10 s so Neon can scale to zero. */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL is not set')
    pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 })
  }
  return pool
}

/** Ends the pool (graceful shutdown, tests). */
export async function closePool(): Promise<void> {
  const current = pool
  pool = undefined
  await current?.end()
}
