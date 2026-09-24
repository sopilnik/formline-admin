// Applies the SQL migrations as schema_owner and keeps the two database roles
// in shape. Runs at container start before the server listens (stage 9) and by
// hand with `pnpm db:migrate`.
import pg from 'pg'
import { readdir, readFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export type MigrateOptions = {
  migratorUrl: string
  appUrl: string
  dir?: URL
  retryDelaysMs?: number[]
  log?: (event: Record<string, unknown>) => void
}

const DEFAULT_DIR = new URL('../src/server/db/migrations/', import.meta.url)
// About two minutes in total: long enough for a paused Neon compute to wake.
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000]
const MIGRATE_LOCK = 7_201_326

async function connect(url: string, delays: number[]): Promise<pg.Client> {
  for (let attempt = 0; ; attempt++) {
    const client = new pg.Client({ connectionString: url })
    try {
      await client.connect()
      return client
    } catch (error) {
      await client.end().catch(() => undefined)
      const delay = delays[attempt]
      if (delay === undefined) throw new Error(`database unreachable after ${attempt + 1} attempts`, { cause: error })
      await sleep(delay)
    }
  }
}

function appCredentials(appUrl: string): { password: string } {
  const url = new URL(appUrl)
  if (decodeURIComponent(url.username) !== 'app') throw new Error('DATABASE_URL must connect as the app role')
  const password = decodeURIComponent(url.password)
  if (password.length < 16) throw new Error('the app role password must be at least 16 characters')
  return { password }
}

async function bootstrap(client: pg.Client, password: string): Promise<void> {
  const lit = client.escapeLiteral(password)
  const attrs = 'nosuperuser nobypassrls nocreatedb nocreaterole noinherit'
  await client.query(`do $$ begin
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'schema_owner') then
      create role schema_owner nologin ${attrs};
    end if;
  end $$`)
  await client.query('grant schema_owner to current_user')
  const exists = await client.query("select 1 from pg_catalog.pg_roles where rolname = 'app'")
  await client.query(exists.rowCount
    ? `alter role app with login password ${lit} ${attrs}`
    : `create role app login password ${lit} ${attrs}`)
  const { rows } = await client.query<{ db: string }>('select current_database() as db')
  await client.query(`grant connect on database ${client.escapeIdentifier(rows[0]!.db)} to app`)
  await client.query('create schema if not exists fa authorization schema_owner')
  await client.query('grant usage on schema fa to app')
  await client.query('set role schema_owner')
  await client.query('create table if not exists fa.schema_migrations (version text primary key, applied_at timestamptz not null default now())')
  await client.query('reset role')
}

export async function migrate(options: MigrateOptions): Promise<{ applied: string[] }> {
  const log = options.log ?? (() => undefined)
  const dir = options.dir ?? DEFAULT_DIR
  const { password } = appCredentials(options.appUrl)
  const client = await connect(options.migratorUrl, options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS)
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATE_LOCK])
    await bootstrap(client, password)
    const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()
    const done = new Set((await client.query<{ version: string }>('select version from fa.schema_migrations')).rows.map(r => r.version))
    const applied: string[] = []
    for (const file of files) {
      if (done.has(file)) continue
      const text = await readFile(new URL(file, dir), 'utf8')
      await client.query('begin')
      try {
        await client.query('set local role schema_owner')
        await client.query('set local search_path = pg_catalog')
        await client.query(text)
        await client.query('insert into fa.schema_migrations (version) values ($1)', [file])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
      applied.push(file)
      log({ event: 'migrate.applied', version: file })
    }
    return { applied }
  } finally {
    await client.query('select pg_advisory_unlock_all()').catch(() => undefined)
    await client.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const migratorUrl = process.env.DATABASE_URL_MIGRATOR
  const appUrl = process.env.DATABASE_URL
  if (!migratorUrl || !appUrl) {
    console.error(JSON.stringify({ event: 'migrate.failed', message: 'DATABASE_URL_MIGRATOR and DATABASE_URL are required' }))
    process.exit(1)
  }
  migrate({ migratorUrl, appUrl, log: e => console.log(JSON.stringify(e)) }).then(
    r => console.log(JSON.stringify({ event: 'migrate.done', applied: r.applied })),
    e => {
      console.error(JSON.stringify({ event: 'migrate.failed', message: e instanceof Error ? e.message : String(e) }))
      process.exitCode = 1
    },
  )
}
