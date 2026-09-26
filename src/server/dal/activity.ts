import 'server-only'
import { activityLog } from '@/server/db/schema'
import type { Tx } from '@/server/db/with-workspace'

export type ActivityEntry = {
  actorUserId: string | null
  action: string
  entityType?: string
  entityId?: string
  details?: Record<string, unknown>
  ipHash?: string | null
}

/** Security and data events (spec §5.7). Every role appends; owners and admins read. */
export async function logActivity(tx: Tx, workspaceId: string, entry: ActivityEntry): Promise<void> {
  await tx.insert(activityLog).values({
    workspaceId,
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    details: entry.details ?? {},
    ipHash: entry.ipHash ?? null,
  })
}
