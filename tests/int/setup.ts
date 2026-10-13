// Every integration file deletes, when it ends, the sandboxes made while it ran. The files run one after another on one
// database (vitest.int.config.ts), so those are all its own, and the demo holds at most 100 live sandboxes:
// without this the suite would run into that cap.
import pg from 'pg'
import { afterAll, beforeAll } from 'vitest'
import { MIGRATOR_URL } from './env'

const admin = new pg.Pool({ connectionString: MIGRATOR_URL, max: 1 })
let since: Date

beforeAll(async () => {
  since = (await admin.query<{ now: Date }>('select now() as now')).rows[0]!.now
})

afterAll(async () => {
  await admin.query("delete from fa.workspaces where kind = 'sandbox' and created_at >= $1", [since])
  await admin.end()
})
