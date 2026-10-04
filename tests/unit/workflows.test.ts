import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('workflows', () => {
  it('keeps the checks a deploy calls apart from a run of CI started by hand', () => {
    // deploy.yml calls ci.yml, which then runs in the caller's context: by the ref alone the deploy's checks and a manual
    // run of CI on main would share one group, and the later run would cancel the deploy's checks.
    expect(read('.github/workflows/ci.yml')).toContain(
      '\n      group: checks-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}\n',
    )
  })
})
