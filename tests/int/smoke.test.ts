import pg from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { adminPool, closeAll } from './db'
import { TEST_DB } from './env'

afterAll(closeAll)

describe('local database stack', () => {
  it('reaches the test database directly', async () => {
    const { rows } = await adminPool().query<{ db: string }>('select current_database() as db')

    expect(rows[0]?.db).toBe(TEST_DB)
  })

  it('reaches it through PgBouncer in transaction mode', async () => {
    const pooled = new pg.Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:56432/${TEST_DB}` })

    await pooled.connect()
    try {
      const { rows } = await pooled.query<{ db: string }>('select current_database() as db')

      expect(rows[0]?.db).toBe(TEST_DB)
    } finally {
      await pooled.end()
    }
  })

  it('runs the Postgres major version of production', async () => {
    // Neon runs Postgres 18; the migrations and the policies are proven on the same major locally.
    const { rows } = await adminPool().query<{ num: string }>("select current_setting('server_version_num') as num")
    const version = Number(rows[0]?.num)

    expect(version).toBeGreaterThanOrEqual(180000)
    expect(version).toBeLessThan(190000)
  })
})
