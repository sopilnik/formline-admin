import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

/** The jobs of a workflow by name, each as the text of its block. */
function jobs(path: string): Record<string, string> {
  const text = read(path).split('\njobs:\n')[1]!
  return Object.fromEntries(text.split(/\n(?= {2}[\w-]+:\n)/).map(block => [block.trim().split(':')[0]!, block]))
}

describe('workflows', () => {
  it('keeps the checks a deploy calls apart from a run of CI started by hand, and a fork\'s pull request apart from every branch', () => {
    // deploy.yml calls ci.yml, which then runs in the caller's context: by the branch alone the deploy's checks and a manual
    // run of CI on main would share one group, and the later run would cancel the deploy's checks. A pull request goes by its
    // number: by its branch's name, a fork's branch called like one here could cancel that branch's checks.
    expect(read('.github/workflows/ci.yml')).toContain(
      '\n      group: checks-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}\n',
    )
  })

  it('audits the production packages right after the install, before any check', () => {
    expect(read('.github/workflows/ci.yml')).toMatch(/- run: pnpm install --frozen-lockfile\n[^\n]*\n {6}- run: pnpm audit --prod\n/)
  })

  it('gives the registry\'s write token only to a job that installs no packages', () => {
    const writers = Object.entries(jobs('.github/workflows/deploy.yml')).filter(([, block]) => block.includes('packages: write'))

    expect(writers.map(([name]) => name)).toEqual(['image'])
    expect(writers[0]![1]).not.toMatch(/pnpm install|playwright install/)
  })

  it('builds the image with a builder and an SBOM scanner pinned by digest', () => {
    const image = jobs('.github/workflows/deploy.yml').image!

    expect(image).toMatch(/\n {10}driver-opts: image=moby\/buildkit:v\d+\.\d+\.\d+@sha256:[0-9a-f]{64}\n/)
    expect(image).toMatch(/\n {10}attests: type=sbom,generator=docker\/buildkit-syft-scanner:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}\n/)
    expect(image).not.toContain('sbom: true')
  })

  it('lets Dependabot update the images the compose file runs as well as the Dockerfile\'s', () => {
    const ecosystems = [...read('.github/dependabot.yml').matchAll(/package-ecosystem: "([\w-]+)"/g)].map(match => match[1])

    expect(ecosystems).toEqual(['npm', 'github-actions', 'docker', 'docker-compose'])
  })
})
