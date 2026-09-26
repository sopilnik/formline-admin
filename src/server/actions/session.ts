'use server'

import { redirect } from 'next/navigation'
import { clearSessionCookie, deleteSession, getSession, workspaceContext } from '@/server/auth/sessions'
import { authConfig } from '@/server/config'
import { logActivity } from '@/server/dal/activity'
import { withWorkspace } from '@/server/db/with-workspace'
import { hashIp } from '@/server/ratelimit/ip'
import { getClientIp } from '@/server/request'

/** Signs out of this device (spec §5.1). Stage 3 turns a sandbox sign-out into ending the sandbox. */
export async function signOutAction(): Promise<void> {
  const session = await getSession()
  if (session) {
    const ipHash = hashIp(await getClientIp(), authConfig().ipHashKey)
    await withWorkspace(workspaceContext(session), async tx => {
      await deleteSession(tx, session)
      await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.sign_out', ipHash })
    })
  }
  await clearSessionCookie()
  redirect('/sign-in')
}
