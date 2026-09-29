// Recreates the end-to-end database and applies the migrations. `pnpm test:e2e`
// runs it after the build and before Playwright starts the server.
import { rm } from 'node:fs/promises'
import pg from 'pg'
import { migrate } from '../../scripts/migrate.ts'
import { E2E_ADMIN_URL, E2E_APP_URL, E2E_DB, E2E_MEDIA_DIR, E2E_MIGRATOR_URL } from './constants.ts'

const admin = new pg.Client({ connectionString: E2E_ADMIN_URL })
await admin.connect()
try {
  // FORCE ends PgBouncer's server connections left from the previous run.
  await admin.query(`drop database if exists ${E2E_DB} with (force)`)
  await admin.query(`create database ${E2E_DB}`)
} finally {
  await admin.end()
}
await migrate({ migratorUrl: E2E_MIGRATOR_URL, appUrl: E2E_APP_URL })
// Uploads of the previous run belong to sandboxes that no longer exist.
await rm(E2E_MEDIA_DIR, { recursive: true, force: true })
console.log(JSON.stringify({ event: 'e2e.database.ready', database: E2E_DB }))
