import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/actor'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { listTeam } from '@/server/dal/team'
import { withWorkspace } from '@/server/db/with-workspace'
import { changeMemberActive, changeMemberRole } from '@/server/team/members'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox, memberIds } from './fixtures'

let admin: pg.Pool
let app: pg.Pool
let owner: Actor
let ids: Record<'owner' | 'admin' | 'manager' | 'viewer', string>

beforeAll(async () => {
  admin = adminPool()
  app = appPool()

  const { workspaceId, userId } = await createSandbox(app)

  owner = { workspaceId, userId, role: 'owner', ipHash: 'ip-hash-of-the-test' }
  ids = await memberIds(admin, owner.workspaceId)
})

afterAll(closeAll)

const as = (role: keyof typeof ids): Actor => ({ ...owner, userId: ids[role], role })

const logged = async (userId: string) => (await admin.query<{ action: string; actor: string; details: Record<string, string> }>(
  "select action, actor_user_id as actor, details from fa.activity_log where workspace_id = $1 and entity_type = 'user' and entity_id = $2 order by at",
  [owner.workspaceId, userId])).rows

const roleOf = async (userId: string) => (await admin.query<{ role: string; deactivated: boolean }>(
  'select role, deactivated_at is not null as deactivated from fa.users where workspace_id = $1 and id = $2', [owner.workspaceId, userId])).rows[0]!

describe('listTeam', () => {
  it('lists every member, the owner first, with two-factor and the latest activity from the log', async () => {
    await admin.query('update fa.users set totp_secret_enc = $3 where workspace_id = $1 and id = $2', [owner.workspaceId, ids.viewer, 'k.x.y.z'])

    const team = await withWorkspace(owner, tx => listTeam(tx, owner.workspaceId), app)

    expect(team.map(m => m.role)).toEqual(['owner', 'admin', 'manager', 'viewer'])
    expect(team.map(m => m.twoFactor)).toEqual([false, false, false, true])

    const created = (await admin.query<{ at: Date }>("select at from fa.activity_log where workspace_id = $1 and action = 'sandbox.created'", [owner.workspaceId])).rows[0]!.at

    expect(team[0]!.lastActiveAt?.getTime()).toBe(created.getTime())
    expect(team.slice(1).map(m => m.lastActiveAt)).toEqual([null, null, null])
  })
})

describe('changeMemberRole', () => {
  it('gives another member a new role and logs the change', async () => {
    const result = await changeMemberRole(owner, { userId: ids.manager, role: 'viewer' }, app)

    expect(result).toEqual({ ok: true, name: 'Priya Nair', from: 'manager', changed: true })
    expect((await roleOf(ids.manager)).role).toBe('viewer')
    expect(await logged(ids.manager)).toEqual([{ action: 'team.role_changed', actor: owner.userId, details: { name: 'Priya Nair', from: 'manager', to: 'viewer' } }])
    expect(await changeMemberRole(as('admin'), { userId: ids.manager, role: 'viewer' }, app)).toMatchObject({ ok: true, changed: false })
    expect(await logged(ids.manager)).toHaveLength(1)

    await changeMemberRole(as('admin'), { userId: ids.manager, role: 'manager' }, app)

    expect((await roleOf(ids.manager)).role).toBe('manager')
  })

  it('refuses the owner row, one’s own row and a role that may not manage the team', async () => {
    expect(await changeMemberRole(as('admin'), { userId: ids.owner, role: 'viewer' }, app)).toEqual({ ok: false, reason: 'not_allowed' })
    expect(await changeMemberRole(as('admin'), { userId: ids.admin, role: 'viewer' }, app)).toEqual({ ok: false, reason: 'not_allowed' })
    expect(await changeMemberRole(as('manager'), { userId: ids.viewer, role: 'admin' }, app)).toEqual({ ok: false, reason: 'not_allowed' })
    expect(await changeMemberRole(owner, { userId: randomUUID(), role: 'viewer' }, app)).toEqual({ ok: false, reason: 'not_found' })
    expect([(await roleOf(ids.owner)).role, (await roleOf(ids.admin)).role, (await roleOf(ids.viewer)).role]).toEqual(['owner', 'admin', 'viewer'])
  })
})

describe('changeMemberActive', () => {
  it('deactivates a member, which ends their sessions, and reactivates them', async () => {
    await admin.query(
      "insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified) values ($1, $2, $3, now() + interval '1 hour', true)",
      [owner.workspaceId, hashToken(generateToken()), ids.admin])

    expect(await changeMemberActive(owner, { userId: ids.admin, active: false }, app)).toEqual({ ok: true, name: 'Noah Becker', from: 'admin', changed: true })
    expect((await roleOf(ids.admin)).deactivated).toBe(true)

    const sessions = await admin.query<{ n: number }>('select count(*)::int as n from fa.sessions where workspace_id = $1 and user_id = $2', [owner.workspaceId, ids.admin])

    expect(sessions.rows[0]!.n).toBe(0)
    expect(await changeMemberActive(owner, { userId: ids.admin, active: true }, app)).toMatchObject({ ok: true, changed: true })
    expect((await roleOf(ids.admin)).deactivated).toBe(false)
    expect((await logged(ids.admin)).map(e => e.action)).toEqual(['team.deactivated', 'team.reactivated'])
  })

  it('refuses the owner, oneself and a manager', async () => {
    expect(await changeMemberActive(as('admin'), { userId: ids.owner, active: false }, app)).toEqual({ ok: false, reason: 'not_allowed' })
    expect(await changeMemberActive(owner, { userId: ids.owner, active: false }, app)).toEqual({ ok: false, reason: 'not_allowed' })
    expect(await changeMemberActive(as('manager'), { userId: ids.viewer, active: false }, app)).toEqual({ ok: false, reason: 'not_allowed' })
    expect((await roleOf(ids.viewer)).deactivated).toBe(false)
  })
})
