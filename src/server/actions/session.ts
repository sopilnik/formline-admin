'use server'

import { redirect } from 'next/navigation'
import { clearSessionCookie, deleteSession, getSession, workspaceContext } from '@/server/auth/sessions'
import { authConfig } from '@/server/config'
import { logActivity } from '@/server/dal/activity'
import { withWorkspace } from '@/server/db/with-workspace'
import { hashIp } from '@/server/ratelimit/ip'
import { getClientIp } from '@/server/request'
import { endSandbox } from '@/server/sandbox/lifecycle'

/** Signs out of this device (spec §5.1); in a sandbox that ends the sandbox itself (spec §6.4). */
export async function signOutAction(): Promise<void> {
  const session = await getSession()
  if (session?.workspaceKind === 'sandbox') {
    await endSandbox(session)
  } else if (session) {
    const ipHash = hashIp(await getClientIp(), authConfig().ipHashKey)
    await withWorkspace(workspaceContext(session), async tx => {
      await deleteSession(tx, session)
      await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.sign_out', ipHash })
    })
  }
  await clearSessionCookie()
  redirect('/sign-in')
}
