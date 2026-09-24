import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { is } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import * as schema from '@/server/db/schema'
import { adminPool, closeAll } from './db'

afterAll(closeAll)

const tables = Object.values(schema).filter(value => is(value, PgTable)) as PgTable[]

describe('Drizzle schema matches the SQL migrations', () => {
  it('covers every table of schema fa', async () => {
    const { rows } = await adminPool().query<{ name: string }>(
      "select table_name as name from information_schema.tables where table_schema = 'fa' and table_name <> 'schema_migrations' order by 1")
    expect(tables.map(t => getTableConfig(t).name).sort()).toEqual(rows.map(r => r.name))
  })

  it.each(tables.map(t => [getTableConfig(t).name, t] as const))('%s has the same columns and nullability', async (name, table) => {
    const { rows } = await adminPool().query<{ column_name: string; is_nullable: 'YES' | 'NO' }>(
      "select column_name, is_nullable from information_schema.columns where table_schema = 'fa' and table_name = $1", [name])
    const db = Object.fromEntries(rows.map(r => [r.column_name, r.is_nullable === 'NO']))
    const ts = Object.fromEntries(getTableConfig(table).columns.map(c => [c.name, c.notNull]))
    expect(ts).toEqual(db)
  })
})
