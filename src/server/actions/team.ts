'use server'

import { refresh } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { formText } from '@/lib/auth-form'
import { fail, ok, type ActionResult } from '@/lib/result'
import { ASSIGNABLE_ROLES, EMAIL_MAX, MEMBER_NAME_MAX, type InviteField } from '@/lib/team'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import { actorOf } from '@/server/actor'
import { requireSession, setSessionCookie } from '@/server/auth/sessions'
import { TOKEN_PATTERN } from '@/server/auth/tokens'
import { summariseUserAgent } from '@/server/auth/user-agent'
import { can } from '@/server/authz/matrix'
import { acceptInvitation, inviteMember, resendInvitation, revokeMemberInvitation } from '@/server/team/invitations'
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

const inviteInput = z.object({ email: z.email().max(EMAIL_MAX), role: z.enum(ASSIGNABLE_ROLES) })
const idInput = z.object({ id: z.uuid() }).strict()

export type InviteState =
  | { status: 'idle' }
  | { status: 'error'; error: 'email_invalid' | 'member' | 'pending' | 'cap' | 'forbidden'; values: Record<InviteField, string> }
  /** `count` tells one invitation from the next. */
  | { status: 'done'; email: string; count: number }

/** "Invite" on the team page (spec §8.6): the letter with the link goes to the outbox. */
export async function inviteMemberAction(previous: InviteState, form: FormData): Promise<InviteState> {
  const session = await requireSession()
  const values = { email: formText(form, 'email').trim(), role: formText(form, 'role') }
  if (!can(session.role, 'team.manage', session.workspaceKind)) return { status: 'error', error: 'forbidden', values }
  const parsed = inviteInput.safeParse(values)
  if (!parsed.success) return { status: 'error', error: 'email_invalid', values }
  // A sandbox session lives as long as its sandbox, and so does the invitation.
  const result = await inviteMember(await actorOf(session), { ...parsed.data, expiresAt: session.expiresAt })
  if (!result.ok) return { status: 'error', error: result.reason, values }
  refresh()
  return { status: 'done', email: parsed.data.email.toLowerCase(), count: previous.status === 'done' ? previous.count + 1 : 1 }
}

/** "Resend": the same link in a new letter. */
export async function resendInvitationAction(input: unknown): Promise<ActionResult<{ email: string }>> {
  const session = await requireSession()
  if (!can(session.role, 'team.manage', session.workspaceKind)) return fail('forbidden')
  const parsed = idInput.safeParse(input)
  if (!parsed.success) return fail('invalid')
  const result = await resendInvitation(await actorOf(session), parsed.data.id)
  if (!result) return fail('not_found')
  // The new letter and its log entry show on other pages, which the browser keeps for a minute (W.1).
  refresh()
  return ok(result)
}

/** "Revoke": the link stops working. */
export async function revokeInvitationAction(input: unknown): Promise<ActionResult<{ email: string }>> {
  const session = await requireSession()
  if (!can(session.role, 'team.manage', session.workspaceKind)) return fail('forbidden')
  const parsed = idInput.safeParse(input)
  if (!parsed.success) return fail('invalid')
  const result = await revokeMemberInvitation(await actorOf(session), parsed.data.id)
  if (!result) return fail('not_found')
  refresh()
  return ok(result)
}

export type AcceptState = { status: 'idle' } | { status: 'error'; error: 'name_required' | 'invalid' | 'taken'; name: string }

/** Accepting an invitation from the letter's link: the visitor continues as the new member (spec §8.6). */
export async function acceptInvitationAction(_previous: AcceptState, form: FormData): Promise<AcceptState> {
  const session = await requireSession()
  const name = formText(form, 'name').trim()
  const token = formText(form, 'token')
  if (!TOKEN_PATTERN.test(token)) return { status: 'error', error: 'invalid', name }
  if (name.length < 1 || [...name].length > MEMBER_NAME_MAX) return { status: 'error', error: 'name_required', name }
  const actor = await actorOf(session)
  const preferences = { locale: await getLocale(), theme: parseTheme((await cookies()).get(THEME_COOKIE)?.value) }
  const result = await acceptInvitation(session, { token, name, userAgentSummary: summariseUserAgent((await headers()).get('user-agent')), ipHash: actor.ipHash, preferences })
  if (!result.ok) return { status: 'error', error: result.reason, name }
  await setSessionCookie(result.token, result.expiresAt, { demo: true })
  redirect('/overview')
}
