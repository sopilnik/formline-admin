'use server'

import { refresh } from 'next/cache'
import { retryMinutes } from '@/lib/auth-form'
import type { ImportState, ImportSummary } from '@/lib/stripe/import'
import { actorContext, actorOf } from '@/server/actor'
import { isRecentAuth } from '@/server/auth/reauth'
import { requireSession, type Session } from '@/server/auth/sessions'
import { authorize } from '@/server/authz/authorize'
import { stripeConfig } from '@/server/config'
import { logActivity } from '@/server/dal/activity'
import { withWorkspace } from '@/server/db/with-workspace'
import { log } from '@/server/log'
import { consume } from '@/server/ratelimit/consume'
import { userSubject } from '@/server/ratelimit/ip'
import { LIMITS } from '@/server/ratelimit/limits'
import { getRequestId } from '@/server/request'
import { stripeGateway } from '@/server/stripe/gateway'
import { importMissedOrders } from '@/server/stripe/import'

/** Settings → Store → "Import missed orders" (spec §7.5): the owner, after a fresh sign-in, three times an hour. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires this signature; the form carries no fields
export async function importStripeOrdersAction(_previous: ImportState, _form: FormData): Promise<ImportState> {
  const session = await requireSession()
  authorize({ role: session.role, workspaceKind: session.workspaceKind }, 'stripe.import')
  if (!isRecentAuth(session)) return { status: 'error', error: 'reauth_required' }
  const config = stripeConfig()
  if (!config) return { status: 'error', error: 'unavailable' }
  const verdict = await consume(LIMITS.stripeImport, userSubject(session.workspaceId, session.userId))
  if (!verdict.allowed) return { status: 'error', error: 'rate_limited', retryAfterMinutes: retryMinutes(verdict.retryAfterSeconds) }
  let summary: ImportSummary
  try {
    summary = await importMissedOrders({ gateway: stripeGateway(config), pseudonymKey: config.pseudonymKey })
  } catch (error) {
    log.error({ event: 'stripe.import_failed', requestId: await getRequestId(), err: error })
    return { status: 'error', error: 'failed' }
  }

  // The orders are in by now: a failed log entry is logged itself and never turns the import into an error.
  await logImport(session, summary).catch(async error => log.error({ event: 'stripe.import_log_failed', requestId: await getRequestId(), err: error }))
  refresh()
  return { status: 'done', ...summary }
}

async function logImport(session: Session, summary: ImportSummary): Promise<void> {
  const actor = await actorOf(session)
  await withWorkspace(actorContext(actor), tx => logActivity(tx, actor.workspaceId, {
    actorUserId: actor.userId,
    action: 'orders.imported',
    details: { imported: summary.imported.length, numbers: summary.imported, already: summary.already, skipped: summary.skipped, failed: summary.failed },
    ipHash: actor.ipHash,
  }))
}
