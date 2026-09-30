import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { securityNotice } from '@/server/auth/notices'
import { generateToken, hashToken } from '@/server/auth/tokens'
import { getLetter, listLetters } from '@/server/dal/outbox'
import { getSelf } from '@/server/dal/users'
import { withWorkspace, type WorkspaceContext } from '@/server/db/with-workspace'
import { adminPool, appPool, closeAll } from './db'

let admin: pg.Pool
let app: pg.Pool
let owner: WorkspaceContext
let manager: WorkspaceContext
let other: WorkspaceContext

async function sandbox(locale = 'en'): Promise<WorkspaceContext> {
  const { rows } = await app.query<{ outcome: string; sandbox_id: string; demo_user_id: string }>(
    'select outcome, sandbox_id, demo_user_id from fa.create_sandbox($1, $2, $3, $4)',
    [createHash('sha256').update(randomUUID()).digest('hex'), hashToken(generateToken()), 'Vitest', locale])
  expect(rows[0]?.outcome).toBe('created')
  return { workspaceId: rows[0]!.sandbox_id, userId: rows[0]!.demo_user_id, role: 'owner' }
}

beforeAll(async () => {
  admin = adminPool()
  app = appPool()
  owner = await sandbox('ru')
  other = await sandbox()
  const m = await admin.query<{ id: string }>("select id from fa.users where workspace_id = $1 and role = 'manager'", [owner.workspaceId])
  manager = { workspaceId: owner.workspaceId, userId: m.rows[0]!.id, role: 'manager' }
})
afterAll(closeAll)

describe('securityNotice', () => {
  it('writes the bell entry and a letter in the recipient’s language that greets them by name', async () => {
    await withWorkspace(owner, async tx => {
      const self = (await getSelf(tx, owner.userId!))!
      await securityNotice(tx, owner.workspaceId, self, 'auth.new_sign_in', { device: 'Firefox, Linux' })
    }, app)
    const { rows } = await admin.query<{ to_address: string; template: string; payload: Record<string, unknown> }>(
      'select to_address, template, payload from fa.outbox_emails where workspace_id = $1', [owner.workspaceId])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ to_address: 'dana.ortiz@formline.example', template: 'auth.new_sign_in' })
    expect(rows[0]!.payload).toMatchObject({ device: 'Firefox, Linux', name: 'Dana Ortiz', locale: 'ru' })
    expect(Number.isNaN(Date.parse(String(rows[0]!.payload.at)))).toBe(false)
    const bell = await admin.query<{ payload: Record<string, unknown> }>(
      "select payload from fa.notifications where workspace_id = $1 and kind = 'auth.new_sign_in'", [owner.workspaceId])
    expect(bell.rows[0]!.payload).not.toHaveProperty('name')
  })
})

describe('the outbox', () => {
  it('pages the letters newest first', async () => {
    for (let i = 1; i <= 4; i++) {
      await admin.query(
        "insert into fa.outbox_emails (workspace_id, to_address, template, payload, created_at) values ($1, $2, 'auth.second_factor_locked', '{}', now() - make_interval(hours => $3))",
        [owner.workspaceId, `letter${i}@example.test`, i])
    }
    const first = await withWorkspace(owner, tx => listLetters(tx, owner.workspaceId, { page: 1, size: 2 }), app)
    expect(first.total).toBe(5)
    expect(first.pages).toBe(3)
    expect(first.rows.map(r => r.to)).toEqual(['dana.ortiz@formline.example', 'letter1@example.test'])
    const second = await withWorkspace(owner, tx => listLetters(tx, owner.workspaceId, { page: 2, size: 2 }), app)
    expect(second.rows.map(r => r.to)).toEqual(['letter2@example.test', 'letter3@example.test'])
    expect((await withWorkspace(owner, tx => getLetter(tx, owner.workspaceId, first.rows[1]!.id), app))?.template).toBe('auth.second_factor_locked')
  })

  it('shows nothing to a manager or to another workspace', async () => {
    const [letter] = (await withWorkspace(owner, tx => listLetters(tx, owner.workspaceId, { page: 1, size: 25 }), app)).rows
    const managerView = await withWorkspace(manager, tx => listLetters(tx, manager.workspaceId, { page: 1, size: 25 }), app)
    expect([managerView.total, managerView.rows]).toEqual([0, []])
    expect(await withWorkspace(manager, tx => getLetter(tx, manager.workspaceId, letter!.id), app)).toBeNull()
    expect((await withWorkspace(other, tx => listLetters(tx, other.workspaceId, { page: 1, size: 25 }), app)).total).toBe(0)
    expect(await withWorkspace(other, tx => getLetter(tx, other.workspaceId, letter!.id), app)).toBeNull()
  })
})
