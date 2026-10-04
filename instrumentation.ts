export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { readEnv } = await import('@/server/env')
    const env = readEnv()
    // While the database is unreachable the container start runs the server in maintenance mode (spec §13): nothing here
    // may wait for the database then, and the start restarts the server without the flag once the database is back.
    if (env.FORMLINE_MAINTENANCE === '1') return
    const { getPool } = await import('@/server/db/pool')
    const { assertAppRole } = await import('@/server/db/role-check')
    await assertAppRole(getPool())
    const { scheduleDailyJob } = await import('@/server/jobs/daily')
    scheduleDailyJob()
  }
}
