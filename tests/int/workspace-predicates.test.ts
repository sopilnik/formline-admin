import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { countUnusedRecoveryCodes } from '@/server/auth/self-factors'
import { countPasskeys, listPasskeys } from '@/server/dal/passkeys'
import { getSelf, listMembers } from '@/server/dal/users'
import { withWorkspace } from '@/server/db/with-workspace'
import { adminPool, closeAll } from './db'
import { asSchemaOwner, createWorkspace } from './fixtures'

let admin: pg.Pool

/** Two sandboxes whose owners share one user id, as every sandbox copies the template's ids, each with a passkey and a code. */
async function twins(): Promise<{ a: string; b: string; userId: string }> {
  const a = await createWorkspace(admin)
  const b = await createWorkspace(admin)
  const userId = randomUUID()
  await asSchemaOwner(admin, async c => {
    for (const [workspace, name] of [[a, 'Owner A'], [b, 'Owner B']] as const) {
      await c.query("insert into fa.users (workspace_id, id, email, name, role) values ($1, $2, $3, $4, 'owner')", [workspace, userId, `${randomUUID()}@example.test`, name])
      await c.query("insert into fa.passkeys (workspace_id, user_id, credential_id, public_key, name) values ($1, $2, $3, 'pk', 'Laptop')", [workspace, userId, randomUUID()])
      await c.query('insert into fa.recovery_codes (workspace_id, user_id, code_hash) values ($1, $2, $3)', [workspace, userId, createHash('sha256').update(randomUUID()).digest('hex')])
    }
  })
  return { a, b, userId }
}

beforeAll(() => {
  admin = adminPool()
})
afterAll(closeAll)

describe('user, passkey and recovery-code queries', () => {
  // The superuser bypasses row-level security, so only the queries' own predicates keep the other sandbox out.
  it('name the workspace as well as the user, so they hold without row-level security', async () => {
    const { a, b, userId } = await twins()
    const who = { workspaceId: b, userId }
    const read = await withWorkspace({ workspaceId: b, userId, role: 'owner' }, async tx => ({
      self: (await getSelf(tx, who))?.name,
      members: (await listMembers(tx, b)).map(m => m.name),
      passkeys: (await listPasskeys(tx, who)).length,
      counted: await countPasskeys(tx, who),
      codes: await countUnusedRecoveryCodes(tx, who),
    }), admin)
    expect(read).toEqual({ self: 'Owner B', members: ['Owner B'], passkeys: 1, counted: 1, codes: 1 })
    expect(a).not.toBe(b)
  })
})
