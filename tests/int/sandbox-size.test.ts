import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminPool, appPool, closeAll } from './db'
import { createSandbox } from './fixtures'

const SANDBOXES = 20
const LIMIT_BYTES = 2 * 1024 * 1024

let admin: pg.Pool
let app: pg.Pool

beforeAll(() => {
  admin = adminPool()
  app = appPool()
})
afterAll(closeAll)

async function tableBytes(): Promise<number> {
  const { rows } = await admin.query<{ bytes: string }>(
    "select coalesce(sum(pg_total_relation_size(c.oid)), 0) as bytes from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'fa' and c.relkind = 'r'")

  return Number(rows[0]!.bytes)
}

async function create(): Promise<string> {
  const { workspaceId } = await createSandbox(app)

  return workspaceId
}

describe('sandbox size', () => {
  it('stays at or under 2 MB of table and index space per sandbox', async () => {
    // Earlier files deleted rows; a full vacuum returns that space, so growth below measures new rows only.
    const { rows: tables } = await admin.query<{ name: string }>("select table_name as name from information_schema.tables where table_schema = 'fa'")

    for (const t of tables) await admin.query(`vacuum full fa.${t.name}`)

    const before = await tableBytes()
    const made: string[] = []

    try {
      for (let i = 0; i < SANDBOXES; i++) made.push(await create())

      const perSandbox = (await tableBytes() - before) / SANDBOXES

      console.log(JSON.stringify({ event: 'measure.sandbox_bytes', perSandbox: Math.round(perSandbox), sandboxes: SANDBOXES }))
      expect(perSandbox).toBeLessThanOrEqual(LIMIT_BYTES)
    } finally {
      await admin.query('delete from fa.workspaces where id = any($1::uuid[])', [made])
    }
  }, 120_000)
})
