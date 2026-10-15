import 'server-only'
import { sql } from 'drizzle-orm'
import { uniqueConstraintOf } from '@/server/db/errors'
import type { Tx } from '@/server/db/with-workspace'

/** The kinds of row a workspace may hold only so many of. */
type Capped = 'products' | 'collections' | 'team'

/**
 * Holds the workspace's lock for one capped kind of row until the transaction ends. Two saves can then no longer both
 * count one under the cap and both insert: the second waits, then counts the first one's row.
 */
export async function lockCap(tx: Tx, workspaceId: string, kind: Capped): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`cap:${kind}:${workspaceId}`}, 0))`)
}

/**
 * Runs a write in a savepoint and answers a broken unique constraint with its refusal: a save that a concurrent one
 * beat past the check reads as "taken", as the check would have said, instead of failing the request. The transaction
 * stays usable after the refusal; any other error goes on.
 */
export async function refuseTaken<T, R extends string>(
  tx: Tx, refusals: Readonly<Record<string, R>>, write: () => Promise<T>,
): Promise<T | { ok: false; reason: R }> {
  await tx.execute(sql`savepoint refuse_taken`)

  try {
    const result = await write()

    await tx.execute(sql`release savepoint refuse_taken`)

    return result
  } catch (error) {
    const reason = refusals[uniqueConstraintOf(error) ?? '']

    if (!reason) {
      throw error
    }

    await tx.execute(sql`rollback to savepoint refuse_taken`)

    return { ok: false, reason }
  }
}
