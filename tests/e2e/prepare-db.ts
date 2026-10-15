// Recreates the end-to-end databases, one per worker, and applies the migrations to each. `pnpm test:e2e` runs it
// after the build and before Playwright starts the servers.
import { rm } from 'node:fs/promises'
import pg from 'pg'
import { migrate } from '../../scripts/migrate.ts'
import { E2E_ADMIN_URL, E2E_WORKERS, e2eWorker } from './constants.ts'

const workers = Array.from({ length: E2E_WORKERS }, (_, index) => e2eWorker(index))

const admin = new pg.Client({ connectionString: E2E_ADMIN_URL })

await admin.connect()
try {
  for (const worker of workers) {
    // FORCE ends PgBouncer's server connections left from the previous run.
    await admin.query(`drop database if exists ${worker.database} with (force)`)
    await admin.query(`create database ${worker.database}`)
  }
} finally {
  await admin.end()
}

// One after another: the migrations keep the two roles of the whole cluster in shape.
for (const worker of workers) await migrate({ migratorUrl: worker.migratorUrl, appUrl: worker.appUrl })
// Uploads of the previous run belong to sandboxes that no longer exist.
await rm('test-media', { recursive: true, force: true })
console.log(JSON.stringify({ event: 'e2e.databases.ready', databases: workers.map(worker => worker.database) }))
