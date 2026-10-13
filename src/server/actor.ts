import 'server-only'
import type { Session } from '@/server/auth/sessions'
import { authConfig } from '@/server/config'
import type { Role } from '@/server/db/with-workspace'
import { hashIp } from '@/server/ratelimit/ip'
import { getClientIp } from '@/server/request'

/** Who is changing workspace data: the request identity plus the address hash the activity log keeps. */
export type Actor = { workspaceId: string; userId: string; role: Role; ipHash: string | null }

/** The hash of the requesting address, as the activity log and the sessions keep it; never the address itself. */
export async function requestIpHash(): Promise<string | null> {
  return hashIp(await getClientIp(), authConfig().ipHashKey)
}

export async function actorOf(session: Session): Promise<Actor> {
  return { workspaceId: session.workspaceId, userId: session.userId, role: session.role, ipHash: await requestIpHash() }
}
