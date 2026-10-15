import pg from 'pg'
import { APP_DIRECT_URL, APP_POOLED_URL, MIGRATOR_URL } from './env'

const pools: pg.Pool[] = []

function make(connectionString: string, max: number): pg.Pool {
  const pool = new pg.Pool({ connectionString, max })

  pools.push(pool)

  return pool
}

/** Superuser, direct: sets fixtures up and bypasses row-level security. */
export const adminPool = (): pg.Pool => make(MIGRATOR_URL, 4)
/** The application role through PgBouncer in transaction mode, as in production. */
export const appPool = (): pg.Pool => make(APP_POOLED_URL, 4)
/** The application role on one direct connection, for session-level behavior. */
export const appDirectPool = (): pg.Pool => make(APP_DIRECT_URL, 1)

export async function closeAll(): Promise<void> {
  await Promise.all(pools.splice(0).map(pool => pool.end()))
}
