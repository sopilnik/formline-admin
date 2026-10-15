import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withWorkspace } from '@/server/db/with-workspace'
import { appPool, closeAll } from './db'

let app: pg.Pool

beforeAll(() => {
  app = appPool()
})
afterAll(closeAll)

describe('withWorkspace', () => {
  it('ends any statement of a workspace transaction that runs past 30 seconds', async () => {
    // The bare pool falls under the app role's own default (tests/int/migrate.test.ts).
    const inside = await withWorkspace({ workspaceId: randomUUID(), userId: null, role: 'system' }, async tx =>
      (await tx.execute<{ timeout: string }>(sql`select current_setting('statement_timeout') as timeout`)).rows[0]!.timeout, app)

    expect(inside).toBe('30s')
  })
})
