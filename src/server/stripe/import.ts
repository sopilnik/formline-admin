import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import type { Pool } from 'pg'
import { DAY_MS } from '@/lib/periods'
import { readCheckout } from '@/lib/stripe/checkout'
import { IMPORT_DAYS, IMPORT_MAX_SESSIONS, type ImportSummary } from '@/lib/stripe/import'
import { ownerWorkspaceId } from '@/server/auth/owner'
import { getPool } from '@/server/db/pool'
import { orders } from '@/server/db/schema'
import { withWorkspace } from '@/server/db/with-workspace'
import { log } from '@/server/log'
import type { StripeGateway } from '@/server/stripe/gateway'
import { ingestOrder } from '@/server/stripe/ingest'

type ImportDeps = { gateway: StripeGateway; pseudonymKey: string; pool?: Pool; now?: Date }
type Session = Awaited<ReturnType<StripeGateway['completedSessions']>>['sessions'][number]
type Outcome = { kind: 'imported'; number: number } | { kind: 'already' | 'skipped' | 'failed' }

/** One paid session through the ingest. A failure is logged with the session's id and counted, and the import goes on. */
async function importSession(session: Session, deps: ImportDeps, pool: Pool): Promise<Outcome> {
  try {
    const reading = readCheckout(session, await deps.gateway.lineItems(session.id))

    if (!reading.ok) return { kind: 'skipped' }

    const result = await ingestOrder(reading.order, { eventId: null, pseudonymKey: deps.pseudonymKey }, pool)

    return result.status === 'created' ? { kind: 'imported', number: result.number } : { kind: 'already' }
  } catch (error) {
    log.error({ event: 'stripe.import_session_failed', sessionId: session.id, err: error })

    return { kind: 'failed' }
  }
}

/**
 * The paid sessions of the last 30 days the owner workspace does not have yet, kept through the same ingest as the
 * webhook, oldest first so their numbers follow time. A session the webhook keeps meanwhile counts as
 * already there.
 */
export async function importMissedOrders(deps: ImportDeps): Promise<ImportSummary> {
  const pool = deps.pool ?? getPool()
  const since = new Date((deps.now ?? new Date()).getTime() - IMPORT_DAYS * DAY_MS)
  const { sessions, more } = await deps.gateway.completedSessions(since, IMPORT_MAX_SESSIONS)
  const workspaceId = await ownerWorkspaceId(pool)
  const ids = sessions.map(s => s.id)
  const kept = ids.length === 0 ? [] : await withWorkspace({ workspaceId, userId: null, role: 'system' }, tx => tx
    .select({ id: orders.stripeSessionId }).from(orders)
    .where(and(eq(orders.workspaceId, workspaceId), inArray(orders.stripeSessionId, ids))), pool)
  const known = new Set(kept.map(row => row.id))
  const summary: ImportSummary = { imported: [], already: 0, skipped: 0, failed: 0, more }

  for (const session of [...sessions].sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))) {
    if (known.has(session.id)) {
      summary.already += 1
      continue
    }
    if (session.payment_status !== 'paid') {
      summary.skipped += 1
      continue
    }

    const outcome = await importSession(session, deps, pool)

    if (outcome.kind === 'imported') summary.imported.push(outcome.number)
    else summary[outcome.kind] += 1
  }

  return summary
}
