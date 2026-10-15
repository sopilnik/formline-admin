import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_ACTIONS } from '@/lib/activity/actions'
import en from '../../messages/en.json'

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)

    return statSync(path).isDirectory() ? files(path, ext) : ext.test(name) ? [path] : []
  })
}

/** Every action the code writes to the log: `logActivity` calls in the server and the routes, the exports' `logExport`, and the definer functions' inserts. */
function writtenActions(): Set<string> {
  const found = new Set<string>()

  for (const file of [...files('src/server', /\.ts$/), ...files('app', /\.tsx?$/)]) {
    const source = readFileSync(file, 'utf8')

    if (!source.includes('logActivity(') && !source.includes('logExport(')) continue
    for (const match of source.matchAll(/action: (?:[a-z]+ \? )?'([a-z_]+\.[a-z_]+)'(?: : '([a-z_]+\.[a-z_]+)')?/g)) {
      found.add(match[1]!)
      if (match[2]) found.add(match[2])
    }
    for (const match of source.matchAll(/logExport\(\w+, '([a-z_]+\.[a-z_]+)'/g)) found.add(match[1]!)
  }
  for (const file of files('src/server/db/migrations', /\.sql$/)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/insert into fa\.activity_log[^;]*?'([a-z_]+\.[a-z_]+)'/g)) found.add(match[1]!)
  }

  return found
}

describe('the activity log', () => {
  it('lists every action the code writes, and nothing it never writes', () => {
    expect([...writtenActions()].sort()).toEqual([...ACTIVITY_ACTIONS].sort())
  })

  it('has a label for every action', () => {
    const labels = en.activity.actions as Record<string, Record<string, string>>

    for (const action of ACTIVITY_ACTIONS) {
      const [area, name] = action.split('.') as [string, string]

      expect(labels[area]?.[name], action).toBeTruthy()
    }
  })
})
