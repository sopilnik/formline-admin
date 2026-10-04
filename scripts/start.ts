// The container's first process (spec §13): the migrations, the role check, then the server, which never sees the
// migrator's address. While the database cannot be reached the server answers in maintenance mode and the migrations
// keep retrying; a role with too many rights, a refused login or a failed migration stops the container instead.
import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { AppRoleError, assertAppRole } from '../src/server/db/role-check.ts'
import { readEnv } from '../src/server/env.ts'
import { migrate, MigrateConfigError } from './migrate.ts'

export type Env = Record<string, string | undefined>
export type Server = { stop(signal: NodeJS.Signals): void; exited: Promise<number> }
type Log = (event: Record<string, unknown>) => void

export type StartDeps = {
  env: Env
  /** Runs the migrations, retrying a connection after each of the delays. */
  migrate(retryDelaysMs: number[]): Promise<void>
  checkRole(): Promise<void>
  serve(env: Env): Server
  /** Resolves with the signal that asks the container to stop. */
  stopped: Promise<NodeJS.Signals>
  sleep(ms: number): Promise<void>
  log: Log
}

/** About 15 s at start, so liveness answers well inside bunny's 120 s start-up window even when the database does not. */
export const FIRST_RETRIES_MS = [1_000, 2_000, 4_000, 8_000]
/** Between the background attempts while in maintenance mode. */
export const RETRY_EVERY_MS = 30_000

/**
 * A connection that cannot be made is passing: a paused Neon compute, a network fault. Anything the database itself
 * answers with — a refused login, an unknown database, a failed migration — and a role with too many rights is not.
 */
export function classify(error: unknown): 'unreachable' | 'refused' {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e instanceof AppRoleError || e instanceof MigrateConfigError) return 'refused'
    if (e instanceof pg.DatabaseError) {
      // Class 08 is a connection exception; 57P01–57P03 a server shutting down or starting; 53300 too many connections.
      return /^(08|57P0[1-3]|53300)/.test(e.code ?? '') ? 'unreachable' : 'refused'
    }
  }
  return 'unreachable'
}

/** The innermost reason behind an error: "database unreachable after 5 attempts" may hide a refused password. */
function causeOf(error: unknown): string | undefined {
  let reason: string | undefined
  for (let e = error instanceof Error ? error.cause : undefined; e instanceof Error; e = e.cause) reason = e.message
  return reason
}

export function withoutMigrator(env: Env): Env {
  const rest = { ...env }
  delete rest.DATABASE_URL_MIGRATOR
  return rest
}

async function prepare(deps: StartDeps, retryDelaysMs: number[]): Promise<'ready' | 'unreachable' | 'refused'> {
  try {
    await deps.migrate(retryDelaysMs)
    await deps.checkRole()
    return 'ready'
  } catch (error) {
    const verdict = classify(error)
    const cause = causeOf(error)
    deps.log({
      event: verdict === 'refused' ? 'start.refused' : 'start.unreachable',
      message: error instanceof Error ? error.message : String(error),
      ...(cause === undefined ? {} : { cause }),
    })
    return verdict
  }
}

/** Runs the container and resolves with its exit code. */
export async function runStart(deps: StartDeps): Promise<number> {
  try {
    readEnv(deps.env)
    if (!deps.env.DATABASE_URL_MIGRATOR) throw new Error('DATABASE_URL_MIGRATOR is required')
  } catch (error) {
    deps.log({ event: 'start.refused', message: error instanceof Error ? error.message : String(error) })
    return 1
  }
  const serverEnv = withoutMigrator(deps.env)
  const first = await prepare(deps, FIRST_RETRIES_MS)
  if (first === 'refused') return 1
  let maintenance = first === 'unreachable'
  let server = deps.serve(maintenance ? { ...serverEnv, FORMLINE_MAINTENANCE: '1' } : serverEnv)
  deps.log({ event: 'start.serving', maintenance })
  for (;;) {
    const next = await Promise.race([
      server.exited.then(code => ({ kind: 'exited' as const, code })),
      deps.stopped.then(signal => ({ kind: 'stop' as const, signal })),
      ...(maintenance ? [deps.sleep(RETRY_EVERY_MS).then(() => ({ kind: 'retry' as const }))] : []),
    ])
    if (next.kind === 'stop') {
      server.stop(next.signal)
      return await server.exited
    }
    if (next.kind === 'exited') {
      deps.log({ event: 'start.server_exited', code: next.code })
      return next.code
    }
    const verdict = await prepare(deps, [])
    if (verdict === 'unreachable') continue
    server.stop('SIGTERM')
    await server.exited
    if (verdict === 'refused') return 1
    server = deps.serve(serverEnv)
    maintenance = false
    deps.log({ event: 'start.serving', maintenance })
  }
}

/** The role check on its own short-lived pool (the server keeps its own). */
export async function checkRole(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 })
  try {
    await assertAppRole(pool)
  } finally {
    await pool.end()
  }
}

function serve(script: string, env: Env): Server {
  // Next.js declares NODE_ENV required on ProcessEnv; the start passes the container's own, which carries it.
  const child = spawn(process.execPath, [script], { stdio: 'inherit', env: env as NodeJS.ProcessEnv })
  const exited = new Promise<number>(resolve => {
    child.on('exit', (code, signal) => resolve(code ?? 128 + (signal ? constants.signals[signal] : 0)))
  })
  return { stop: signal => { child.kill(signal) }, exited }
}

/** The container's process (scripts/container.ts): the real database, the standalone server beside it, the signals. */
export function main(): void {
  const log: Log = event => console.log(JSON.stringify(event))
  const env: Env = process.env
  const stopped = new Promise<NodeJS.Signals>(resolve => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => resolve(signal))
  })
  void runStart({
    env,
    migrate: async retryDelaysMs => {
      await migrate({ migratorUrl: env.DATABASE_URL_MIGRATOR ?? '', appUrl: env.DATABASE_URL ?? '', retryDelaysMs, log })
    },
    checkRole: () => checkRole(env.DATABASE_URL ?? ''),
    // The bundle runs as /app/scripts/start.mjs; the standalone server sits at /app/server.js.
    serve: serverEnv => serve(fileURLToPath(new URL('../server.js', import.meta.url)), serverEnv),
    stopped,
    sleep: ms => sleep(ms),
    log,
  }).then(code => process.exit(code))
}
