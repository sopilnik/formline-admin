'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { failureState, type AuthError, type FormState } from '@/lib/auth-form'
import { formText } from '@/lib/form'
import { fail, ok, type ActionResult } from '@/lib/result'
import { disableOwnTotp, enableOwnTotp, regenerateOwnRecoveryCodes } from '@/server/auth/self-factors'
import { changeOwnPassword, revokeOtherSessions, revokeOwnSession } from '@/server/auth/self-security'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { getClientIp } from '@/server/request'

/** Settings → Security → Password: the owner's new password; the other devices are signed out. */
export async function changePasswordAction(_previous: FormState<'password'>, form: FormData): Promise<FormState<'password'>> {
  const session = await requireSession()

  if (!can(session.role, 'self.manage', session.workspaceKind)) return { status: 'error', error: 'generic' }

  const result = await changeOwnPassword(session, { password: formText(form, 'password'), ip: await getClientIp() })

  if (!result.ok) return failureState(result)
  refresh()

  return { status: 'done' }
}

const sessionInput = z.strictObject({ id: z.string().regex(/^[0-9a-f]{64}$/) })

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

/** Settings → Security → Authenticator app: turn it on or replace it with the key the page showed. */
export async function enableTotpAction(_previous: FormState<'code'>, form: FormData): Promise<FormState<'code'>> {
  const session = await requireSession()

  if (!can(session.role, 'self.manage', session.workspaceKind)) return { status: 'error', error: 'generic' }

  const result = await enableOwnTotp(session, { secret: formText(form, 'totpSecret'), code: formText(form, 'code'), ip: await getClientIp() })

  if (!result.ok) return failureState(result)
  refresh()

  return { status: 'done', recoveryCodes: result.recoveryCodes ?? undefined }
}

/** "Turn off" the authenticator. */
export async function disableTotpAction(): Promise<{ ok: true } | { ok: false; error: AuthError }> {
  const session = await requireSession()

  if (!can(session.role, 'self.manage', session.workspaceKind)) return { ok: false, error: 'generic' }

  const result = await disableOwnTotp(session, { ip: await getClientIp() })

  if (!result.ok) return { ok: false, error: result.error }
  refresh()

  return { ok: true }
}

/** "Make new codes": ten recovery codes, shown once. */
export async function regenerateRecoveryCodesAction(_previous: FormState, _form: FormData): Promise<FormState> {
  const session = await requireSession()

  if (!can(session.role, 'self.manage', session.workspaceKind)) return { status: 'error', error: 'generic' }

  const result = await regenerateOwnRecoveryCodes(session, { ip: await getClientIp() })

  if (!result.ok) return failureState(result)
  refresh()

  return { status: 'done', recoveryCodes: result.recoveryCodes }
}
