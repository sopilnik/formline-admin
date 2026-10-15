import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
// Static files, and the applied migrations, which stay as they ran.
const SKIP_PREFIXES = ['public/', 'src/server/db/migrations/']
const TEXT = /\.(css|json|md|mjs|sql|ts|tsx|yml)$|(^|\/)(Dockerfile|\.env\.example)$/
const SELF = 'tests/unit/reference-rules.test.ts'

// The tracked files only: what git ignores is not part of the repository.
function textFiles(): string[] {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')

  return tracked.filter(name => TEXT.test(name) && name !== SELF && !SKIP_PREFIXES.some(prefix => name.startsWith(prefix)))
}

/** Pointers into private design notes, dated decisions and tracker labels: nothing in the repository resolves them. */
const PRIVATE = new RegExp([
  'spec §', 'his decision', 'the owner[\'’]s (?:decision|word)', 'visual walk', 'amendment \\d', '\\bW\\.\\d', '\\bstage \\d',
  '\\btask \\d',
  '\\(\\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)\\)',
].join('|'), 'i')

describe('text files', () => {
  it.each(textFiles())('%s cites no private note, dated decision or tracker label', name => {
    expect(readFileSync(join(root, name), 'utf8')).not.toMatch(PRIVATE)
  })
})
