import pg from 'pg'
import { setTimeout as sleep } from 'node:timers/promises'
import { migrate } from '../../scripts/migrate'
import { ADMIN_URL, APP_POOLED_URL, MIGRATOR_URL, TEST_DB } from './env'

async function waitForDatabase(url: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString: url })
    try {
      await client.connect()
      await client.query('select 1')
      return
    } catch (error) {
      if (attempt >= 30) throw new Error(`database not reachable at ${url}; run pnpm db:up`, { cause: error })
      await sleep(1000)
    } finally {
      await client.end().catch(() => undefined)
    }
  }
}

export default async function setup(): Promise<void> {
  await waitForDatabase(ADMIN_URL)
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  try {
    // FORCE ends PgBouncer's server connections left from the previous run.
    await admin.query(`drop database if exists ${TEST_DB} with (force)`)
    await admin.query(`create database ${TEST_DB}`)
  } finally {
    await admin.end()
  }
  await migrate({ migratorUrl: MIGRATOR_URL, appUrl: APP_POOLED_URL })
}
