import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Zod checks whether it may compile code with `new Function`; in the browser the Content
// Security Policy refuses that and reports a violation. So no module the browser
// loads may import Zod: this walks every client component's imports to find out.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FORBIDDEN = /^zod(\/|$)/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const directive = (source: string): string | undefined => /^\s*['"]use (client|server)['"]/.exec(source)?.[1]

// The path aliases of tsconfig.json, so the walk follows them as the bundler does.
const ALIASES: [prefix: string, dir: string][] = [['@/', 'src'], ['@seed/', 'db/seed'], ['@messages/', 'messages']]

function resolveImport(from: string, specifier: string): string | null {
  const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix))
  const base = alias ? join(root, alias[1], specifier.slice(alias[0].length)) : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null
  if (base === null) return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const IMPORT = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

/** The chain of files from `file` to a forbidden package, or null. A server action module ends the walk: the browser gets a reference to it. */
function forbiddenChain(file: string, seen = new Set<string>()): string[] | null {
  if (seen.has(file)) return null
  seen.add(file)
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1]!
    if (FORBIDDEN.test(specifier)) return [relative(root, file), specifier]
    const next = resolveImport(file, specifier)
    if (!next || directive(readFileSync(next, 'utf8')) === 'server') continue
    const chain = forbiddenChain(next, seen)
    if (chain) return [relative(root, file), ...chain]
  }
  return null
}

const clientFiles = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src'))].filter(file => directive(readFileSync(file, 'utf8')) === 'client')

describe('client bundles', () => {
  it('has client components to check', () => {
    expect(clientFiles.length).toBeGreaterThan(10)
  })

  it.each(clientFiles.map(file => relative(root, file)))('%s does not pull Zod into the browser', file => {
    expect(forbiddenChain(join(root, file))).toBeNull()
  })
})
