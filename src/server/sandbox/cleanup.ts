import 'server-only'
import type { Pool } from 'pg'
import { getPool } from '@/server/db/pool'
import { log } from '@/server/log'

/** Deletes expired and idle sandboxes. Errors are logged, never raised: this runs off the critical path (spec §6.4). */
export async function cleanupExpiredSandboxes(pool: Pool = getPool()): Promise<number> {
  try {
    const { rows } = await pool.query<{ n: number }>('select fa.delete_expired_sandboxes() as n')
    const deleted = rows[0]?.n ?? 0
    if (deleted > 0) log.info({ event: 'sandbox.cleanup', deleted })
    return deleted
  } catch (error) {
    log.error({ event: 'sandbox.cleanup_failed', err: error })
    return 0
  }
}
