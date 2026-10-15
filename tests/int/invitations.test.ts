import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Theme } from '@/lib/theme'
import type { Actor } from '@/server/actor'
import type { Session } from '@/server/auth/sessions'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { findInvitation } from '@/server/dal/invitations'
import { withWorkspace } from '@/server/db/with-workspace'
import { acceptInvitation, inviteMember, resendInvitation, revokeMemberInvitation } from '@/server/team/invitations'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, errorText, insertSession } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: Actor
let expiresAt: Date

type Sandbox = { actor: Actor; sessionHash: string; expiresAt: Date }

async function sandbox(locale = 'en'): Promise<Sandbox> {
  const { workspaceId, userId, token, expiresAt } = await createSandbox(app, { locale })

  return { actor: { workspaceId, userId, role: 'owner', ipHash: 'ip-hash-of-the-test' }, sessionHash: hashToken(token), expiresAt }
}

/** A verified session of a member, as the cookie of a visitor who switched to them would carry. */
const sessionOf = (actor: Actor, userId = actor.userId): Promise<Session> => insertSession(admin, { workspaceId: actor.workspaceId, userId })

const tokenOfLetter = async (workspaceId: string, email: string): Promise<string> => (await admin.query<{ token: string }>(
  "select payload->>'token' as token from fa.outbox_emails where workspace_id = $1 and to_address = $2 and template = 'team.invitation' order by created_at desc limit 1",
  [workspaceId, email])).rows[0]!.token
const meta = { userAgentSummary: 'Vitest', ipHash: 'ip-hash-of-the-test', preferences: { locale: 'ru', theme: 'system' } } as const

beforeAll(async () => {
  admin = adminPool()
  app = appPool()

  const box = await sandbox('ru')

  owner = box.actor
  expiresAt = box.expiresAt
})
afterAll(closeAll)

describe('inviteMember', () => {
  it('stores the invitation, writes the letter with its link in the inviter’s language and logs it', async () => {
    const result = await inviteMember(owner, { email: 'Alex.Kim@Example.test', role: 'manager', expiresAt }, app)

    expect(result.ok).toBe(true)

    const { rows } = await admin.query<{ email: string; role: string; token_hash: string; token: string; expires_at: Date }>(
      'select email, role, token_hash, token, expires_at from fa.invitations where workspace_id = $1', [owner.workspaceId])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ email: 'alex.kim@example.test', role: 'manager' })
    expect(rows[0]!.expires_at.getTime()).toBe(expiresAt.getTime())

    const letter = await admin.query<{ payload: Record<string, string> }>(
      "select payload from fa.outbox_emails where workspace_id = $1 and template = 'team.invitation'", [owner.workspaceId])

    expect(letter.rows[0]!.payload).toEqual({ inviter: 'Dana Ortiz', role: 'manager', token: rows[0]!.token, locale: 'ru' })
    expect(hashToken(rows[0]!.token)).toBe(rows[0]!.token_hash)

    const log = await admin.query<{ details: Record<string, string> }>("select details from fa.activity_log where workspace_id = $1 and action = 'team.invited'", [owner.workspaceId])

    expect(log.rows.map(r => r.details)).toEqual([{ email: 'alex.kim@example.test', role: 'manager' }])
  })

  it('refuses a member’s email, a second open invitation and a full team', async () => {
    expect(await inviteMember(owner, { email: 'NOAH.BECKER@formline.example', role: 'viewer', expiresAt }, app)).toEqual({ ok: false, reason: 'member' })
    expect(await inviteMember(owner, { email: 'alex.kim@example.test', role: 'viewer', expiresAt }, app)).toEqual({ ok: false, reason: 'pending' })
    // Four members and one open invitation: fifteen more fill the team.
    for (let i = 0; i < 15; i++) {
      await admin.query(
        "insert into fa.invitations (workspace_id, email, role, token_hash, invited_by, expires_at) values ($1, $2, 'viewer', $3, $4, now() + interval '1 hour')",
        [owner.workspaceId, `filler${i}@example.test`, hashToken(generateToken()), owner.userId])
    }
    expect(await inviteMember(owner, { email: 'one.more@example.test', role: 'viewer', expiresAt }, app)).toEqual({ ok: false, reason: 'cap' })
    await admin.query("update fa.invitations set revoked_at = now() where workspace_id = $1 and email like 'filler%'", [owner.workspaceId])
  })

  it('is refused to a manager by row-level security', async () => {
    const { rows } = await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'manager'", [owner.workspaceId])
    const manager: Actor = { ...owner, userId: rows[0]!.id, role: 'manager' }

    await expect(inviteMember(manager, { email: 'sneaky@example.test', role: 'admin', expiresAt }, app)).rejects.toSatisfy(error => /row-level security/.test(errorText(error)))
  })
})

describe('acceptInvitation', () => {
  it('creates the member with the invited role and the visitor’s language, and continues as them', async () => {
    const token = await tokenOfLetter(owner.workspaceId, 'alex.kim@example.test')
    const caller = await sessionOf(owner)
    const result = await acceptInvitation(caller, { token, name: 'Alex Kim', ...meta }, app)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.expiresAt.getTime()).toBe(expiresAt.getTime())

    const member = (await admin.query<{ id: string; role: string; name: string; locale: string }>(
      "select id, role, name, locale from fa.users where workspace_id = $1 and email = 'alex.kim@example.test'", [owner.workspaceId])).rows[0]!

    expect(member).toMatchObject({ role: 'manager', name: 'Alex Kim', locale: 'ru' })

    const sessions = await admin.query<{ id: string; user_id: string }>('select id, user_id from fa.sessions where id = any($1)', [[caller.id, result.id]])

    expect(sessions.rows).toEqual([{ id: result.id, user_id: member.id }])

    const invitation = await admin.query<{ accepted: boolean }>("select accepted_at is not null as accepted from fa.invitations where workspace_id = $1 and email = 'alex.kim@example.test'", [owner.workspaceId])

    expect(invitation.rows[0]!.accepted).toBe(true)

    const log = await admin.query<{ actor: string; details: Record<string, string> }>(
      "select actor_user_id as actor, details from fa.activity_log where workspace_id = $1 and action = 'team.invitation_accepted'", [owner.workspaceId])

    expect(log.rows).toEqual([{ actor: member.id, details: { name: 'Alex Kim', role: 'manager' } }])

    const bell = await admin.query<{ user_id: string; payload: Record<string, string> }>(
      "select user_id, payload from fa.notifications where workspace_id = $1 and kind = 'team.invitation_accepted'", [owner.workspaceId])

    expect(bell.rows).toEqual([{ user_id: owner.userId, payload: { name: 'Alex Kim', role: 'manager' } }])
    expect(await acceptInvitation(await sessionOf(owner), { token, name: 'Alex Again', ...meta }, app)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('hands the visitor\'s language, theme and shortcut switch to the new member', async () => {
    await inviteMember(owner, { email: 'sam.lee@example.test', role: 'viewer', expiresAt }, app)

    const token = await tokenOfLetter(owner.workspaceId, 'sam.lee@example.test')
    const admin2 = (await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'admin'", [owner.workspaceId])).rows[0]!.id

    await admin.query('update fa.users set shortcuts_enabled = false where workspace_id = $1 and id = $2', [owner.workspaceId, admin2])

    const result = await acceptInvitation(await sessionOf(owner, admin2), { token, name: 'Sam Lee', ...meta, preferences: { locale: 'ru', theme: 'dark' } }, app)

    expect(result.ok).toBe(true)

    const member = await admin.query<{ locale: string; theme: string; shortcuts_enabled: boolean }>(
      "select locale, theme, shortcuts_enabled from fa.users where workspace_id = $1 and email = 'sam.lee@example.test'", [owner.workspaceId])

    expect(member.rows[0]).toEqual({ locale: 'ru', theme: 'dark', shortcuts_enabled: false })
  })

  it('changes nothing when the member cannot be written: the visitor keeps the session and the invitation stays open', async () => {
    await inviteMember(owner, { email: 'kept.open@example.test', role: 'viewer', expiresAt }, app)

    const token = await tokenOfLetter(owner.workspaceId, 'kept.open@example.test')
    const caller = await sessionOf(owner)
    // A theme the users table refuses fails the member's row, after the acceptance has replaced the visitor's session.
    const refused = { ...meta, preferences: { locale: 'en' as const, theme: 'neon' as Theme } }
    const refusal = await acceptInvitation(caller, { token, name: 'Kept Open', ...refused }, app).then(() => '', errorText)

    expect(refusal).toMatch(/violates check constraint "users_theme_check"/)
    expect((await admin.query('select 1 from fa.sessions where id = $1', [caller.id])).rowCount).toBe(1)

    const invitation = await admin.query<{ accepted: boolean }>(
      "select accepted_at is not null as accepted from fa.invitations where workspace_id = $1 and email = 'kept.open@example.test'", [owner.workspaceId])

    expect(invitation.rows[0]!.accepted).toBe(false)
  })

  it('refuses a revoked invitation and one the email of which became a member meanwhile', async () => {
    await inviteMember(owner, { email: 'revoked@example.test', role: 'viewer', expiresAt }, app)

    const revokedToken = await tokenOfLetter(owner.workspaceId, 'revoked@example.test')
    const id = (await admin.query<{ id: string }>("select id from fa.invitations where workspace_id = $1 and email = 'revoked@example.test'", [owner.workspaceId])).rows[0]!.id

    expect(await revokeMemberInvitation(owner, id, app)).toEqual({ email: 'revoked@example.test' })
    expect(await revokeMemberInvitation(owner, id, app)).toBeNull()
    expect(await acceptInvitation(await sessionOf(owner), { token: revokedToken, name: 'Too Late', ...meta }, app)).toEqual({ ok: false, reason: 'invalid' })

    await inviteMember(owner, { email: 'taken@example.test', role: 'viewer', expiresAt }, app)

    const takenToken = await tokenOfLetter(owner.workspaceId, 'taken@example.test')

    await admin.query("insert into fa.users (workspace_id, email, name, role) values ($1, 'taken@example.test', 'Already Here', 'viewer')", [owner.workspaceId])

    const caller = await sessionOf(owner)

    expect(await acceptInvitation(caller, { token: takenToken, name: 'Second', ...meta }, app)).toEqual({ ok: false, reason: 'taken' })
    expect((await admin.query('select 1 from fa.sessions where id = $1', [caller.id])).rowCount).toBe(1)
  })

  it('accepts one of two concurrent acceptances of the same invitation', async () => {
    await inviteMember(owner, { email: 'race@example.test', role: 'viewer', expiresAt }, app)

    const token = await tokenOfLetter(owner.workspaceId, 'race@example.test')
    const [a, b] = await Promise.all([
      acceptInvitation(await sessionOf(owner), { token, name: 'Racer A', ...meta }, app),
      acceptInvitation(await sessionOf(owner), { token, name: 'Racer B', ...meta }, app),
    ])

    expect([a.ok, b.ok].sort()).toEqual([false, true])

    const members = await admin.query<{ n: number }>("select count(*)::int as n from fa.users where workspace_id = $1 and email = 'race@example.test'", [owner.workspaceId])

    expect(members.rows[0]!.n).toBe(1)
  })

  it('works only in the sandbox that sent it', async () => {
    await inviteMember(owner, { email: 'elsewhere@example.test', role: 'viewer', expiresAt }, app)

    const token = await tokenOfLetter(owner.workspaceId, 'elsewhere@example.test')
    const other = await sandbox()

    expect(await withWorkspace(other.actor, tx => findInvitation(tx, hashToken(token)), app)).toBeNull()
    expect(await acceptInvitation(await sessionOf(other.actor), { token, name: 'Stranger', ...meta }, app)).toEqual({ ok: false, reason: 'invalid' })
    expect(await withWorkspace(owner, tx => findInvitation(tx, hashToken(token)), app)).toEqual({ state: 'pending', email: 'elsewhere@example.test', role: 'viewer', inviterName: 'Dana Ortiz' })
  })

  it('writes the same link into a new letter on resend', async () => {
    await inviteMember(owner, { email: 'resend@example.test', role: 'viewer', expiresAt }, app)

    const id = (await admin.query<{ id: string }>("select id from fa.invitations where workspace_id = $1 and email = 'resend@example.test'", [owner.workspaceId])).rows[0]!.id
    const first = await tokenOfLetter(owner.workspaceId, 'resend@example.test')

    expect(await resendInvitation(owner, id, app)).toEqual({ email: 'resend@example.test' })

    const letters = await admin.query<{ token: string }>(
      "select payload->>'token' as token from fa.outbox_emails where workspace_id = $1 and to_address = 'resend@example.test'", [owner.workspaceId])

    expect(letters.rows.map(r => r.token)).toEqual([first, first])
    expect((await admin.query("select 1 from fa.activity_log where workspace_id = $1 and action = 'team.invitation_resent'", [owner.workspaceId])).rowCount).toBe(1)
  })
})
