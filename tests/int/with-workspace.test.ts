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
  it('ends any statement of the transaction that runs past 30 seconds, and only inside it', async () => {
    const inside = await withWorkspace({ workspaceId: randomUUID(), userId: null, role: 'system' }, async tx =>
      (await tx.execute<{ timeout: string }>(sql`select current_setting('statement_timeout') as timeout`)).rows[0]!.timeout, app)
    expect(inside).toBe('30s')
    const after = await app.query<{ timeout: string }>("select current_setting('statement_timeout') as timeout")
    expect(after.rows[0]!.timeout).toBe('0')
  })
})
