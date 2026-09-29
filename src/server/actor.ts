import 'server-only'
import type { Session } from '@/server/auth/sessions'
import { authConfig } from '@/server/config'
import type { Role } from '@/server/db/with-workspace'
import { hashIp } from '@/server/ratelimit/ip'
import { getClientIp } from '@/server/request'

/** Who is changing workspace data: the request identity plus the address hash the activity log keeps (spec §5.7). */
export type Actor = { workspaceId: string; userId: string; role: Role; ipHash: string | null }

export async function actorOf(session: Session): Promise<Actor> {
  return { workspaceId: session.workspaceId, userId: session.userId, role: session.role, ipHash: hashIp(await getClientIp(), authConfig().ipHashKey) }
}

export function actorContext(actor: Actor): { workspaceId: string; userId: string; role: Role } {
  return { workspaceId: actor.workspaceId, userId: actor.userId, role: actor.role }
}
