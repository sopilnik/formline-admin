'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { failureState, formText, type FormState } from '@/lib/auth-form'
import { fail, ok, type ActionResult } from '@/lib/result'
import { changeOwnPassword, revokeOtherSessions, revokeOwnSession } from '@/server/auth/self-security'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { getClientIp } from '@/server/request'

/** Settings → Security → Password (spec §8.8): the owner's new password; the other devices are signed out. */
export async function changePasswordAction(_previous: FormState<'password'>, form: FormData): Promise<FormState<'password'>> {
  const session = await requireSession()
  if (!can(session.role, 'self.manage', session.workspaceKind)) return { status: 'error', error: 'generic' }
  const result = await changeOwnPassword(session, { password: formText(form, 'password'), ip: await getClientIp() })
  if (!result.ok) return failureState(result)
  refresh()
  return { status: 'done' }
}

const sessionInput = z.object({ id: z.string().regex(/^[0-9a-f]{64}$/) }).strict()

/** "Sign out" on another of one's devices. */
export async function revokeSessionAction(input: unknown): Promise<ActionResult<null>> {
  const session = await requireSession()
  if (!can(session.role, 'self.manage', session.workspaceKind)) return fail('forbidden')
  const parsed = sessionInput.safeParse(input)
  if (!parsed.success) return fail('invalid')
  if (!(await revokeOwnSession(session, parsed.data.id, { ip: await getClientIp() }))) return fail('not_found')
  refresh()
  return ok(null)
}

/** "Sign out of all other devices". */
export async function revokeOtherSessionsAction(): Promise<ActionResult<{ count: number }>> {
  const session = await requireSession()
  if (!can(session.role, 'self.manage', session.workspaceKind)) return fail('forbidden')
  const count = await revokeOtherSessions(session, { ip: await getClientIp() })
  refresh()
  return ok({ count })
}
