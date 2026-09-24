import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { adminPool, closeAll } from './db'
import { createUser, createWorkspace, inRollback } from './fixtures'

let admin: pg.Pool
let wsA: string
let wsB: string
let ownerA: string
let adminA: string
let managerA: string
let viewerA: string

beforeAll(async () => {
  admin = adminPool()
  wsA = await createWorkspace(admin)
  wsB = await createWorkspace(admin)
  ownerA = await createUser(admin, wsA, 'owner')
  adminA = await createUser(admin, wsA, 'admin')
  managerA = await createUser(admin, wsA, 'manager')
  viewerA = await createUser(admin, wsA, 'viewer')
})
afterAll(closeAll)

/** Sets the request identity the way withWorkspace will, inside the current transaction. */
async function actAs(c: pg.PoolClient, workspaceId: string, userId: string | null, role: string): Promise<void> {
  await c.query("select set_config('app.workspace_id', $1, true), set_config('app.user_id', $2, true), set_config('app.role', $3, true)", [workspaceId, userId ?? '', role])
}

describe('workspaces', () => {
  it('requires an expiry for sandboxes and forbids it for other kinds', async () => {
    await inRollback(admin, async c => {
      await expect(c.query("insert into fa.workspaces (kind) values ('sandbox')")).rejects.toThrow(/check constraint/)
    })
    await inRollback(admin, async c => {
      await expect(c.query("insert into fa.workspaces (kind, expires_at) values ('owner', now())")).rejects.toThrow(/check constraint/)
    })
  })

  it('allows one template and one owner workspace', async () => {
    await inRollback(admin, async c => {
      await c.query("insert into fa.workspaces (kind) values ('template')")
      await expect(c.query("insert into fa.workspaces (kind) values ('template')")).rejects.toThrow(/workspaces_one_template/)
    })
    await inRollback(admin, async c => {
      await c.query("insert into fa.workspaces (kind) values ('owner')")
      await expect(c.query("insert into fa.workspaces (kind) values ('owner')")).rejects.toThrow(/workspaces_one_owner/)
    })
  })
})

describe('composite keys', () => {
  it('refuse a session pointing at a user of another workspace', async () => {
    await inRollback(admin, async c => {
      await expect(c.query(
        "insert into fa.sessions (workspace_id, id, user_id, expires_at) values ($1, repeat('a', 64), $2, now() + interval '1 hour')",
        [wsB, viewerA])).rejects.toThrow(/foreign key/)
    })
  })

  it('cascade a workspace deletion to its users and sessions', async () => {
    await inRollback(admin, async c => {
      await c.query("insert into fa.sessions (workspace_id, id, user_id, expires_at) values ($1, repeat('b', 64), $2, now() + interval '1 hour')", [wsA, viewerA])
      await c.query('delete from fa.workspaces where id = $1', [wsA])
      const { rows } = await c.query('select (select count(*)::int from fa.users where workspace_id = $1) as users, (select count(*)::int from fa.sessions where workspace_id = $1) as sessions', [wsA])
      expect(rows[0]).toEqual({ users: 0, sessions: 0 })
    })
  })
})

describe('users', () => {
  it('holds one owner per workspace', async () => {
    await inRollback(admin, async c => {
      await c.query('set local role schema_owner')
      await expect(c.query("insert into fa.users (workspace_id, email, name, role) values ($1, 'second.owner@example.test', 'Second', 'owner')", [wsA])).rejects.toThrow(/users_one_owner/)
    })
  })

  it('treats emails case-insensitively within a workspace', async () => {
    await inRollback(admin, async c => {
      await c.query("insert into fa.users (workspace_id, email, name, role) values ($1, 'Same@Example.test', 'One', 'viewer')", [wsB])
      await expect(c.query("insert into fa.users (workspace_id, email, name, role) values ($1, 'same@example.test', 'Two', 'viewer')", [wsB])).rejects.toThrow(/users_email/)
    })
  })

  it('never lets the application grant the owner role', async () => {
    await inRollback(admin, async c => {
      await actAs(c, wsB, null, 'system')
      await expect(c.query("insert into fa.users (workspace_id, email, name, role) values ($1, 'x@example.test', 'X', 'owner')", [wsB])).rejects.toThrow(/owner role cannot be granted/)
    })
    await inRollback(admin, async c => {
      await actAs(c, wsA, ownerA, 'owner')
      await expect(c.query("update fa.users set role = 'owner' where id = $1", [adminA])).rejects.toThrow(/owner role cannot be granted/)
    })
  })

  it('stops anyone changing their own role', async () => {
    await inRollback(admin, async c => {
      await actAs(c, wsA, adminA, 'admin')
      await expect(c.query("update fa.users set role = 'viewer' where id = $1", [adminA])).rejects.toThrow(/own role/)
    })
  })

  it('protects the owner row from everyone else', async () => {
    await inRollback(admin, async c => {
      await actAs(c, wsA, adminA, 'admin')
      await expect(c.query("update fa.users set name = 'Renamed' where id = $1", [ownerA])).rejects.toThrow(/owner row/)
    })
    await inRollback(admin, async c => {
      await actAs(c, wsA, ownerA, 'owner')
      await c.query("update fa.users set name = 'Renamed' where id = $1", [ownerA])
    })
  })

  it('lets owners and admins change other roles, and nobody else', async () => {
    await inRollback(admin, async c => {
      await actAs(c, wsA, adminA, 'admin')
      await c.query("update fa.users set role = 'viewer' where id = $1", [managerA])
    })
    await inRollback(admin, async c => {
      await actAs(c, wsA, managerA, 'manager')
      await expect(c.query("update fa.users set role = 'manager' where id = $1", [viewerA])).rejects.toThrow(/only owners and admins/)
    })
  })

  it('blocks email and identity changes and self-deactivation', async () => {
    await inRollback(admin, async c => {
      await actAs(c, wsA, viewerA, 'viewer')
      await expect(c.query("update fa.users set email = 'new@example.test' where id = $1", [viewerA])).rejects.toThrow(/email/)
    })
    await inRollback(admin, async c => {
      await actAs(c, wsA, adminA, 'admin')
      await expect(c.query('update fa.users set deactivated_at = now() where id = $1', [adminA])).rejects.toThrow(/deactivates themselves/)
    })
    await inRollback(admin, async c => {
      await actAs(c, wsA, adminA, 'admin')
      await c.query('update fa.users set deactivated_at = now() where id = $1', [viewerA])
    })
  })
})

describe('invitations', () => {
  it('never carry the owner role', async () => {
    await inRollback(admin, async c => {
      await expect(c.query(
        "insert into fa.invitations (workspace_id, email, role, token_hash, invited_by, expires_at) values ($1, 'i@example.test', 'owner', repeat('c', 64), $2, now() + interval '1 day')",
        [wsA, adminA])).rejects.toThrow(/check constraint/)
    })
  })
})
