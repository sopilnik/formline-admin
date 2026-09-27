'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { ORDER_STATUSES } from '@/lib/orders/status'
import { fail, ok, type ActionResult } from '@/lib/result'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { authConfig } from '@/server/config'
import { changeStatuses, type StatusOutcome } from '@/server/orders/change-status'
import { hashIp } from '@/server/ratelimit/ip'
import { getClientIp } from '@/server/request'

const statusInput = z.object({ ids: z.array(z.uuid()).min(1).max(100), to: z.enum(ORDER_STATUSES) })

/** "Change status" of the bulk bar (spec §8.2): the valid orders change, the others come back as skipped. */
export async function changeStatusesAction(input: unknown): Promise<ActionResult<StatusOutcome>> {
  const session = await requireSession()
  if (!can(session.role, 'orders.update', session.workspaceKind)) return fail('forbidden')
  const parsed = statusInput.safeParse(input)
  if (!parsed.success) return fail('invalid')
  const ipHash = hashIp(await getClientIp(), authConfig().ipHashKey)
  const outcome = await changeStatuses({ workspaceId: session.workspaceId, userId: session.userId, role: session.role, ipHash }, parsed.data.ids, parsed.data.to)
  // The list, its chip counts and the sidebar count all change: the router re-renders the page.
  refresh()
  return ok(outcome)
}
