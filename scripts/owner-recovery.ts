// Prints a one-time owner recovery code, valid for 30 minutes (README,
// "Owner recovery"). It needs DATABASE_URL_MIGRATOR: only schema_owner may issue a
// code, the application's own role cannot.
import { createHash, randomBytes } from 'node:crypto'
import pg from 'pg'
import { encodeBase32LowerCaseNoPadding } from '../src/lib/encoding.ts'

const url = process.env.DATABASE_URL_MIGRATOR

if (!url) {
  console.error('owner-recovery: DATABASE_URL_MIGRATOR is required')
  process.exit(1)
}

const code = encodeBase32LowerCaseNoPadding(randomBytes(20))
const client = new pg.Client({ connectionString: url })

await client.connect()
try {
  await client.query('begin')
  await client.query('set local role schema_owner')

  const { rows } = await client.query<{ expires: Date }>('select fa.issue_owner_recovery($1) as expires', [createHash('sha256').update(code).digest('hex')])

  await client.query('commit')
  console.log(`Recovery code: ${code}`)
  console.log(`Valid until ${rows[0]!.expires.toISOString()}. Open /recover and enter it there.`)
} catch (error) {
  await client.query('rollback').catch(() => undefined)
  console.error(`owner-recovery: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  await client.end()
}
