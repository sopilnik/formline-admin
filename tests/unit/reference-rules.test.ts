import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
// Generated, local and static folders and files, and the applied migrations, which stay as they ran.
const SKIP = new Set([
  '.git', '.media', '.next', 'blob-report', 'coverage', 'dist', 'docs', 'next-env.d.ts', 'node_modules', 'playwright-report',
  'public', 'test-media', 'test-results',
])
const FROZEN = 'src/server/db/migrations'
const TEXT = /\.(css|json|md|mjs|sql|ts|tsx|yml)$|^(Dockerfile|\.env\.example)$/
const SELF = 'tests/unit/reference-rules.test.ts'
// The sweep reaches the repository part by part: the parts covered so far, and every file at the root but the README.
const AREAS = ['.github/', 'app/', 'db/', 'messages/', 'scripts/', 'src/components/', 'src/i18n/', 'src/lib/', 'src/server/', 'tests/']
const covered = (name: string) => (name.includes('/') ? AREAS.some(area => name.startsWith(area)) : name !== 'README.md')

function textFiles(dir = ''): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const name = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) return SKIP.has(entry.name) || name === FROZEN ? [] : textFiles(name)
    return TEXT.test(entry.name) && !SKIP.has(entry.name) && name !== SELF ? [name] : []
  })
}

/** Pointers into private design notes, dated decisions and tracker labels: nothing in the repository resolves them. */
const PRIVATE = new RegExp([
  'spec §', 'his decision', 'amendment \\d', '\\bW\\.\\d', '\\bstage \\d', '\\btask \\d',
  '\\(\\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\\)',
].join('|'), 'i')

describe('text files', () => {
  it.each(textFiles().filter(covered))('%s cites no private note, dated decision or tracker label', name => {
    expect(readFileSync(join(root, name), 'utf8')).not.toMatch(PRIVATE)
  })
})
