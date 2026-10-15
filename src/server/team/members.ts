import 'server-only'
import type { Pool } from 'pg'
import type { AssignableRole } from '@/lib/team'
import { type Actor } from '@/server/actor'
import { logActivity } from '@/server/dal/activity'
import { setMemberActive, setMemberRole, type MemberChange } from '@/server/dal/team'
import { getPool } from '@/server/db/pool'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'

/** A role change on the team page, logged as `team.role_changed`. */
export async function changeMemberRole(
  actor: Actor,
  { userId, role }: { userId: string; role: AssignableRole },
  pool: Pool = getPool(),
): Promise<MemberChange> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const result = await setMemberRole(tx, actor.workspaceId, { actorId: actor.userId, userId, role })

    if (result.ok && result.changed) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: 'team.role_changed', entityType: 'user', entityId: userId,
        details: { name: result.name, from: result.from, to: role }, ipHash: actor.ipHash,
      })
    }

    return result
  }, pool)
}

/** Deactivating (which signs the member out everywhere) or reactivating, logged as `team.deactivated` or `team.reactivated`. */
export async function changeMemberActive(
  actor: Actor,
  { userId, active }: { userId: string; active: boolean },
  pool: Pool = getPool(),
): Promise<MemberChange> {
  return withWorkspace(workspaceContext(actor), async tx => {
    const result = await setMemberActive(tx, actor.workspaceId, { actorId: actor.userId, userId, active })

    if (result.ok && result.changed) {
      await logActivity(tx, actor.workspaceId, {
        actorUserId: actor.userId, action: active ? 'team.reactivated' : 'team.deactivated', entityType: 'user', entityId: userId,
        details: { name: result.name }, ipHash: actor.ipHash,
      })
    }

    return result
  }, pool)
}
