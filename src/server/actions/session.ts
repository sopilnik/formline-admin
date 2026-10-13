'use server'

import { redirect } from 'next/navigation'
import { requestIpHash } from '@/server/actor'
import { clearSessionCookie, deleteSession, getSession } from '@/server/auth/sessions'
import { logActivity } from '@/server/dal/activity'
import { withWorkspace, workspaceContext } from '@/server/db/with-workspace'
import { endSandbox } from '@/server/sandbox/lifecycle'

/** Signs out of this device; in a sandbox that ends the sandbox itself. */
export async function signOutAction(): Promise<void> {
  const session = await getSession()
  if (session?.workspaceKind === 'sandbox') {
    await endSandbox(session)
  } else if (session) {
    const ipHash = await requestIpHash()
    await withWorkspace(workspaceContext(session), async tx => {
      await deleteSession(tx, session)
      await logActivity(tx, session.workspaceId, { actorUserId: session.userId, action: 'auth.sign_out', ipHash })
    })
  }
  await clearSessionCookie()
  redirect('/sign-in')
}
