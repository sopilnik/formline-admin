import 'server-only'
import type { Pool } from 'pg'
import { getPool } from '@/server/db/pool'
import type { MediaStorage } from '@/server/media/storage'

export const RETRY_BATCH = 100

/** The wait before the next attempt doubles from one hour and stops growing at a day. */
export function retryDelayHours(attempts: number): number {
  return Math.min(2 ** (attempts - 1), 24)
}

type Pending = { storage_path: string; attempts: number }

/**
 * Deletes queued image paths from storage (spec §6.4, §6.5). A failed attempt puts
 * the row back with its next time; `app` has no UPDATE on the queue, so that is a
 * delete and an insert in one transaction.
 */
export async function drainPendingDeletions(storage: MediaStorage, pool: Pool = getPool(), limit: number = RETRY_BATCH): Promise<{ deleted: number; retried: number }> {
  const { rows } = await pool.query<Pending>(
    'select storage_path, attempts from fa.pending_media_deletions where next_attempt_at <= now() order by next_attempt_at limit $1', [limit])
  let deleted = 0
  let retried = 0
  for (const row of rows) {
    try {
      await storage.delete(row.storage_path)
      await pool.query('delete from fa.pending_media_deletions where storage_path = $1', [row.storage_path])
      deleted++
      continue
    } catch {
      retried++
    }
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('delete from fa.pending_media_deletions where storage_path = $1', [row.storage_path])
      await client.query(
        'insert into fa.pending_media_deletions (storage_path, attempts, next_attempt_at) values ($1, $2, now() + make_interval(hours => $3::int))',
        [row.storage_path, row.attempts + 1, retryDelayHours(row.attempts + 1)])
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }
  return { deleted, retried }
}
