import 'server-only'
import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import type { Pool } from 'pg'
import { ownerWorkspaceId } from '@/server/auth/owner'
import { getPool } from '@/server/db/pool'
import { customers } from '@/server/db/schema'
import { withWorkspace } from '@/server/db/with-workspace'
import { pseudonymFor } from '@/server/stripe/pseudonym'

/** How long after the panel first saw a store customer they become their pseudonym; fa.pseudonymise_customer checks the same. */
export const PSEUDONYMISE_AFTER_DAYS = 30

/**
 * The daily job's part of spec §7.4: an owner-workspace customer becomes their pseudonym 30 days after the panel first saw
 * them — name, email and place, and the name in their "New order" notifications. Orders and amounts stay. Returns how
 * many customers it changed.
 */
export async function pseudonymiseOldCustomers(pseudonymKey: string, pool: Pool = getPool()): Promise<number> {
  const workspaceId = await ownerWorkspaceId(pool)
  const due = await withWorkspace({ workspaceId, userId: null, role: 'system' }, tx => tx
    .select({ id: customers.id, email: customers.email })
    .from(customers)
    .where(and(eq(customers.workspaceId, workspaceId), isNull(customers.pseudonymisedAt), lte(customers.createdAt, sql`now() - make_interval(days => ${PSEUDONYMISE_AFTER_DAYS})`))), pool)
  let changed = 0
  for (const customer of due) {
    const person = pseudonymFor(customer.email, pseudonymKey)
    const { rows } = await pool.query<{ done: boolean }>(
      'select fa.pseudonymise_customer($1, $2, $3, $4, $5) as done', [customer.id, person.email, person.name, person.city, person.country])
    if (rows[0]?.done) changed += 1
  }
  return changed
}
