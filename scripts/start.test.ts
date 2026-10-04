import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { AppRoleError } from '../src/server/db/role-check.ts'
import { MigrateConfigError } from './migrate.ts'
import { classify, runStart, withoutMigrator, type Env, type Server, type StartDeps } from './start.ts'

const KEY = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8='
const ENV: Env = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://app:app-password-0123456789@db.test/neondb',
  DATABASE_URL_MIGRATOR: 'postgres://owner:owner-password@db.test/neondb',
  ORIGIN_AUTH_SECRET: 'x'.repeat(64),
  SITE_URL: 'https://formline-admin.sopilnik.dev',
  IP_HASH_KEY: 'i'.repeat(32),
  COOKIE_SIGNING_KEY: 'c'.repeat(32),
  TOTP_ENCRYPTION_KEYS: `k1:${KEY}`,
}

const unreachable = () => new Error('database unreachable after 1 attempts', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) })
const sqlError = (code: string) => Object.assign(new pg.DatabaseError('failed', 1, 'error'), { code })

type FakeServer = Server & { env: Env; signals: NodeJS.Signals[]; exit(code: number): void }

/** A start with every outside effect faked; `steps` answer the migrations one call after another. */
function harness(steps: Array<'ok' | Error>, role: 'ok' | Error = 'ok') {
  const servers: FakeServer[] = []
  const events: Record<string, unknown>[] = []
  const retries: number[][] = []
  let stop: (signal: NodeJS.Signals) => void = () => undefined
  let tick: () => void = () => undefined
  const deps: StartDeps = {
    env: ENV,
    migrate: async delays => {
      retries.push(delays)
      const step = steps.shift() ?? 'ok'
      if (step !== 'ok') throw step
    },
    checkRole: async () => {
      if (role !== 'ok') throw role
    },
    serve: env => {
      let exit: (code: number) => void = () => undefined
      const exited = new Promise<number>(resolve => { exit = resolve })
      const server: FakeServer = { env, signals: [], exited, exit: code => exit(code), stop: signal => { server.signals.push(signal); exit(143) } }
      servers.push(server)
      return server
    },
    stopped: new Promise(resolve => { stop = resolve }),
    // Each background wait ends only when the test says so.
    sleep: () => new Promise(resolve => { tick = resolve }),
    log: event => { events.push(event) },
  }
  const flush = () => new Promise(resolve => setImmediate(resolve))
  return { deps, servers, events, retries, stop: (signal: NodeJS.Signals) => stop(signal), tick: () => tick(), flush }
}

describe('classify', () => {
  it.each([
    ['a refused connection', unreachable(), 'unreachable'],
    ['a connection that timed out', new Error('Connection terminated due to connection timeout'), 'unreachable'],
    ['a server starting up', sqlError('57P03'), 'unreachable'],
    ['a connection exception', sqlError('08006'), 'unreachable'],
    ['too many connections', sqlError('53300'), 'unreachable'],
    ['a refused password', sqlError('28P01'), 'refused'],
    ['an unknown database', sqlError('3D000'), 'refused'],
    ['a failed migration', sqlError('42P07'), 'refused'],
    ['a role with too many rights', new AppRoleError('over-privileged'), 'refused'],
    ['a wrong setting', new MigrateConfigError('DATABASE_URL must connect as the app role'), 'refused'],
    ['a refused password behind the retries', new Error('database unreachable after 9 attempts', { cause: sqlError('28P01') }), 'refused'],
  ])('%s is %s', (_name, error, expected) => {
    expect(classify(error)).toBe(expected)
  })
})

describe('runStart', () => {
  it('refuses a bad environment before it touches the database', async () => {
    const h = harness([])
    h.deps.env = { ...ENV, IP_HASH_KEY: 'short' }
    expect(await runStart(h.deps)).toBe(1)
    expect(h.retries).toEqual([])
    expect(h.servers).toEqual([])
    h.deps.env = withoutMigrator(ENV)
    expect(await runStart(h.deps)).toBe(1)
    expect(h.events.at(-1)).toMatchObject({ event: 'start.refused', message: 'DATABASE_URL_MIGRATOR is required' })
  })

  it('migrates, checks the role and serves without the migrator\'s address, then passes the stop on', async () => {
    const h = harness(['ok'])
    const running = runStart(h.deps)
    await h.flush()
    expect(h.retries).toEqual([[1_000, 2_000, 4_000, 8_000]])
    expect(h.servers).toHaveLength(1)
    expect(h.servers[0]!.env.DATABASE_URL_MIGRATOR).toBeUndefined()
    expect(h.servers[0]!.env.DATABASE_URL).toBe(ENV.DATABASE_URL)
    expect(h.servers[0]!.env.FORMLINE_MAINTENANCE).toBeUndefined()
    h.stop('SIGTERM')
    expect(await running).toBe(143)
    expect(h.servers[0]!.signals).toEqual(['SIGTERM'])
  })

  it('refuses to serve on a role with too many rights or a failed migration', async () => {
    const role = harness(['ok'], new AppRoleError('over-privileged'))
    expect(await runStart(role.deps)).toBe(1)
    expect(role.servers).toEqual([])
    const migration = harness([sqlError('42P07')])
    expect(await runStart(migration.deps)).toBe(1)
    expect(migration.servers).toEqual([])
  })

  it('serves in maintenance mode while the database is away and restarts the server once it is back', async () => {
    const h = harness([unreachable(), unreachable(), 'ok'])
    const running = runStart(h.deps)
    await h.flush()
    expect(h.servers).toHaveLength(1)
    expect(h.servers[0]!.env.FORMLINE_MAINTENANCE).toBe('1')
    h.tick()
    await h.flush()
    expect(h.servers).toHaveLength(1)
    h.tick()
    await h.flush()
    expect(h.retries).toEqual([[1_000, 2_000, 4_000, 8_000], [], []])
    expect(h.servers[0]!.signals).toEqual(['SIGTERM'])
    expect(h.servers).toHaveLength(2)
    expect(h.servers[1]!.env.FORMLINE_MAINTENANCE).toBeUndefined()
    expect(h.servers[1]!.env.DATABASE_URL_MIGRATOR).toBeUndefined()
    h.stop('SIGTERM')
    expect(await running).toBe(143)
  })

  it('stops a maintenance server and refuses when the database comes back refusing', async () => {
    const h = harness([unreachable(), sqlError('28P01')])
    const running = runStart(h.deps)
    await h.flush()
    h.tick()
    expect(await running).toBe(1)
    expect(h.servers[0]!.signals).toEqual(['SIGTERM'])
    expect(h.servers).toHaveLength(1)
  })

  it('names the reason behind a refusal or an unreachable database in its log', async () => {
    const password = Object.assign(new pg.DatabaseError('password authentication failed for user "owner"', 1, 'error'), { code: '28P01' })
    const refused = harness([new Error('database unreachable after 5 attempts', { cause: password })])
    expect(await runStart(refused.deps)).toBe(1)
    expect(refused.events.at(-1)).toEqual({ event: 'start.refused', message: 'database unreachable after 5 attempts', cause: 'password authentication failed for user "owner"' })
    const away = harness([unreachable()])
    const running = runStart(away.deps)
    await away.flush()
    expect(away.events[0]).toEqual({ event: 'start.unreachable', message: 'database unreachable after 1 attempts', cause: 'connect ECONNREFUSED' })
    away.stop('SIGTERM')
    expect(await running).toBe(143)
    const role = harness(['ok'], new AppRoleError('over-privileged'))
    expect(await runStart(role.deps)).toBe(1)
    expect(role.events.at(-1)).toEqual({ event: 'start.refused', message: 'over-privileged' })
  })

  it('stops with the server when the server stops by itself', async () => {
    const h = harness(['ok'])
    const running = runStart(h.deps)
    await h.flush()
    h.servers[0]!.exit(1)
    expect(await running).toBe(1)
    expect(h.events.at(-1)).toEqual({ event: 'start.server_exited', code: 1 })
  })
})
