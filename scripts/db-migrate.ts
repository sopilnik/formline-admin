// `pnpm db:migrate`: the migrations by hand, against the database the environment names. The container runs them from
// its start instead (scripts/start.ts).
import { migrate } from './migrate.ts'

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
