import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from '../../scripts/migrate'
import { ADMIN_URL, APP_DIRECT_URL, APP_POOLED_URL, MIGRATOR_URL, withDatabase } from './env'

const DB = 'formline_migrate_test'
const migratorUrl = withDatabase(MIGRATOR_URL, DB)
const appUrl = withDatabase(APP_POOLED_URL, DB)
const fixtures = (name: string) => new URL(`./fixtures/${name}/`, import.meta.url)

async function admin<T>(fn: (c: pg.Client) => Promise<T>, url = ADMIN_URL): Promise<T> {
  const c = new pg.Client({ connectionString: url })

  await c.connect()

  try { return await fn(c) } finally { await c.end() }
}

beforeAll(async () => {
  await admin(async c => {
    await c.query(`drop database if exists ${DB} with (force)`)
    await c.query(`create database ${DB}`)
  })
})

afterAll(async () => {
  await admin(c => c.query(`drop database if exists ${DB} with (force)`))
})

describe('migrate', () => {
  it('applies pending files in name order, once', async () => {
    const first = await migrate({ migratorUrl, appUrl, dir: fixtures('migrations-ok'), retryDelaysMs: [] })

    expect(first.applied).toEqual(['0001_first.sql', '0002_second.sql'])

    const second = await migrate({ migratorUrl, appUrl, dir: fixtures('migrations-ok'), retryDelaysMs: [] })

    expect(second.applied).toEqual([])

    const owner = await admin(c => c.query<{ owner: string }>(
      "select pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'fa' and c.relname = 't_first'"), migratorUrl)

    expect(owner.rows[0]?.owner).toBe('schema_owner')
  })

  it('rolls a failing file back and does not record it', async () => {
    await expect(migrate({ migratorUrl, appUrl, dir: fixtures('migrations-bad'), retryDelaysMs: [] })).rejects.toThrow(/division by zero/)

    const rows = await admin(c => c.query("select to_regclass('fa.t_broken') as t, (select count(*)::int from fa.schema_migrations where version = '0001_broken.sql') as n"), migratorUrl)

    expect(rows.rows[0]).toEqual({ t: null, n: 0 })
  })

  it('creates the app role without privileges and keeps its password in step', async () => {
    const role = await admin(c => c.query(
      "select rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit, (select count(*)::int from pg_auth_members m where m.member = r.oid) as memberships from pg_roles r where rolname = 'app'"), migratorUrl)

    expect(role.rows[0]).toEqual({ rolcanlogin: true, rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, memberships: 0 })

    const client = new pg.Client({ connectionString: appUrl })

    await client.connect()

    await expect(client.query('set role schema_owner')).rejects.toThrow(/permission denied/)
    await expect(client.query('create table fa.t_app (id integer)')).rejects.toThrow(/permission denied/)

    await client.end()
  })

  it('bounds every statement of the app role and every lock it waits for', async () => {
    // Roles belong to the whole cluster: start from a role without defaults, as a first start meets it.
    await admin(c => c.query('alter role app reset all'))
    await migrate({ migratorUrl, appUrl, dir: fixtures('migrations-ok'), retryDelaysMs: [] })

    // A connection of its own, as a new one through the pooler is: the defaults apply when a connection starts.
    const settings = await admin(c => c.query<{ statement: string; lock: string }>(
      "select current_setting('statement_timeout') as statement, current_setting('lock_timeout') as lock"), withDatabase(APP_DIRECT_URL, DB))

    expect(settings.rows[0]).toEqual({ statement: '30s', lock: '10s' })
  })

  it('starts again under a migrator that is not a superuser, as Neon\'s owner role is', async () => {
    // Neon's migrator owns the database and holds ADMIN on the roles it created, without being a superuser. Roles belong
    // to the whole cluster, so app and schema_owner exist here already: both runs take the path of a later start.
    const owner = 'formline_owner_test'
    const ownerDb = `${DB}_owner`
    const ownerUrl = `postgres://${owner}:owner-local-password@127.0.0.1:55432/${ownerDb}`
    const ownerAppUrl = withDatabase(APP_POOLED_URL, ownerDb)

    await admin(async c => {
      // A run stopped halfway may have left both behind; the database goes first, as the role owns it.
      await c.query(`drop database if exists ${ownerDb} with (force)`)
      await c.query(`drop role if exists ${owner}`)
      await c.query(`create role ${owner} login createrole password 'owner-local-password'`)
      await c.query(`grant app, schema_owner to ${owner} with admin option`)
      await c.query(`create database ${ownerDb} owner ${owner}`)
    })

    try {
      const first = await migrate({ migratorUrl: ownerUrl, appUrl: ownerAppUrl, dir: fixtures('migrations-ok'), retryDelaysMs: [] })
      const again = await migrate({ migratorUrl: ownerUrl, appUrl: ownerAppUrl, dir: fixtures('migrations-ok'), retryDelaysMs: [] })

      expect(first.applied).toEqual(['0001_first.sql', '0002_second.sql'])
      expect(again.applied).toEqual([])
    } finally {
      await admin(async c => {
        await c.query(`drop database if exists ${ownerDb} with (force)`)
        await c.query(`drop role ${owner}`)
      })
    }
  })

  it('refuses an application URL that is not the app role', async () => {
    await expect(migrate({ migratorUrl, appUrl: appUrl.replace('app:', 'other:'), dir: fixtures('migrations-ok'), retryDelaysMs: [] })).rejects.toThrow(/must connect as the app role/)
  })

  it('gives up after its retries when the database is unreachable', async () => {
    const dead = 'postgres://postgres:postgres@127.0.0.1:1/none'

    await expect(migrate({ migratorUrl: dead, appUrl, retryDelaysMs: [10, 10] })).rejects.toThrow(/unreachable after 3 attempts/)
  })
})
