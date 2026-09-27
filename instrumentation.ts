export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { readEnv } = await import('@/server/env')
    readEnv()
    const { getPool } = await import('@/server/db/pool')
    const { assertAppRole } = await import('@/server/db/role-check')
    await assertAppRole(getPool())
    const { scheduleDailyJob } = await import('@/server/jobs/daily')
    scheduleDailyJob()
  }
}
