import { describe, expect, it } from 'vitest'
import { migrate } from '../../scripts/migrate'
import { checkRole, runStart, type Env, type Server, type StartDeps } from '../../scripts/start'
import { APP_POOLED_URL, MIGRATOR_URL, TEST_AUTH_ENV } from './env'

// The start's own wiring against the test database: the real migrations and role check, a stand-in for the server.
function start(env: Env, roleUrl = APP_POOLED_URL) {
  const served: Env[] = []
  let stop: (signal: NodeJS.Signals) => void = () => undefined
  const deps: StartDeps = {
    env,
    // One attempt each: the test does not wait out the start's retries.
    migrate: async () => { await migrate({ migratorUrl: env.DATABASE_URL_MIGRATOR ?? '', appUrl: env.DATABASE_URL ?? '', retryDelaysMs: [] }) },
    checkRole: () => checkRole(roleUrl),
    serve: serverEnv => {
      served.push(serverEnv)
      let exit: (code: number) => void = () => undefined
      const server: Server = { exited: new Promise(resolve => { exit = resolve }), stop: () => exit(0) }
      return server
    },
    stopped: new Promise(resolve => { stop = resolve }),
    sleep: () => new Promise(() => undefined),
    log: () => undefined,
  }
  return { running: runStart(deps), served, stop: () => stop('SIGTERM') }
}

const ENV: Env = { NODE_ENV: 'production', ORIGIN_AUTH_SECRET: 'x'.repeat(64), ...TEST_AUTH_ENV, DATABASE_URL: APP_POOLED_URL, DATABASE_URL_MIGRATOR: MIGRATOR_URL }
const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('the container start against a real database', () => {
  it('migrates, passes the role check and serves without the migrator\'s address', async () => {
    const s = start(ENV)
    for (let i = 0; i < 100 && s.served.length === 0; i++) await settle()
    expect(s.served).toHaveLength(1)
    expect(s.served[0]!.DATABASE_URL_MIGRATOR).toBeUndefined()
    expect(s.served[0]!.FORMLINE_MAINTENANCE).toBeUndefined()
    s.stop()
    expect(await s.running).toBe(0)
  })

  it('serves in maintenance mode when the database cannot be reached', async () => {
    const s = start({ ...ENV, DATABASE_URL_MIGRATOR: 'postgres://postgres:postgres@127.0.0.1:9/formline_test' })
    for (let i = 0; i < 100 && s.served.length === 0; i++) await settle()
    expect(s.served[0]!.FORMLINE_MAINTENANCE).toBe('1')
    s.stop()
    expect(await s.running).toBe(0)
  })

  it('refuses to serve on a role with too many rights', async () => {
    const s = start(ENV, MIGRATOR_URL)
    expect(await s.running).toBe(1)
    expect(s.served).toEqual([])
  })
})
