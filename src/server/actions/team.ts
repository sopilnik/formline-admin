'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { fail, ok, type ActionResult } from '@/lib/result'
import { ASSIGNABLE_ROLES } from '@/lib/team'
import { actorOf } from '@/server/actor'
import { requireSession } from '@/server/auth/sessions'
import { can } from '@/server/authz/matrix'
import { changeMemberActive, changeMemberRole } from '@/server/team/members'

const roleInput = z.object({ userId: z.uuid(), role: z.enum(ASSIGNABLE_ROLES) }).strict()
const activeInput = z.object({ userId: z.uuid(), active: z.boolean() }).strict()

/** "Make admin / manager / viewer" on the team page (spec §8.6): owners and admins, in sandboxes. */
export async function changeMemberRoleAction(input: unknown): Promise<ActionResult<{ name: string }>> {
  const session = await requireSession()
  if (!can(session.role, 'team.manage', session.workspaceKind)) return fail('forbidden')
  const parsed = roleInput.safeParse(input)
  if (!parsed.success) return fail('invalid')
  const result = await changeMemberRole(await actorOf(session), parsed.data.userId, parsed.data.role)
  if (!result.ok) return fail(result.reason === 'not_found' ? 'not_found' : 'forbidden')
  // The table and the demo banner's list of users both change.
  refresh()
  return ok({ name: result.name })
}

/** "Deactivate" and "Reactivate" on the team page. */
export async function changeMemberActiveAction(input: unknown): Promise<ActionResult<{ name: string }>> {
  const session = await requireSession()
  if (!can(session.role, 'team.manage', session.workspaceKind)) return fail('forbidden')
  const parsed = activeInput.safeParse(input)
  if (!parsed.success) return fail('invalid')
  const result = await changeMemberActive(await actorOf(session), parsed.data.userId, parsed.data.active)
  if (!result.ok) return fail(result.reason === 'not_found' ? 'not_found' : 'forbidden')
  refresh()
  return ok({ name: result.name })
}
