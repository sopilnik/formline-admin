import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

type Sample = { name: string; code: string; path?: string }

const eslint = new ESLint()
const EXAMPLE = 'src/lib/example.ts'
const SCRIPT = 'scripts/example.mjs'
const COMPONENT = 'src/components/example.tsx'
const TS_MODULE = 'scripts/example.mts'
const PADDING = '@stylistic/padding-line-between-statements'
// Each sample breaks one rule of the code-rules block and no other.
const BROKEN: Array<Sample & { rule: string }> = [
  { name: 'a fourth level of nesting', rule: 'max-depth', code: 'export function f(a: boolean): number {\n  if (a) {\n    if (a) {\n      if (a) {\n        if (a) {\n          return 1\n        }\n      }\n    }\n  }\n\n  return 0\n}\n' },
  { name: 'a fourth parameter in TypeScript', rule: '@typescript-eslint/max-params', code: 'export function f(a: number, b: number, c: number, d: number): number {\n  return a + b + c + d\n}\n' },
  { name: 'a fourth parameter in a component file', rule: '@typescript-eslint/max-params', code: 'export function F(a: number, b: number, c: number, d: number) {\n  return a + b + c + d\n}\n', path: COMPONENT },
  { name: 'a fourth parameter in an .mts module', rule: '@typescript-eslint/max-params', code: 'export function f(a: number, b: number, c: number, d: number): number {\n  return a + b + c + d\n}\n', path: TS_MODULE },
  { name: 'a fourth parameter in a script', rule: 'max-params', code: 'export function f(a, b, c, d) {\n  return a + b + c + d\n}\n', path: SCRIPT },
  { name: 'a statement right after a block', rule: PADDING, code: 'export function f(a: boolean, g: () => void): void {\n  if (a) {\n    g()\n  }\n  g()\n}\n' },
  { name: 'a statement right after a block in an .mts module', rule: PADDING, code: 'export function f(a: boolean, g: () => void): void {\n  if (a) {\n    g()\n  }\n  g()\n}\n', path: TS_MODULE },
  { name: 'a block right after a statement', rule: PADDING, code: 'export function f(a: boolean, g: () => void): void {\n  g()\n  if (a) {\n    g()\n  }\n}\n' },
  { name: 'a statement right after a declaration', rule: PADDING, code: 'export function f(g: () => number): number {\n  const y = g()\n  g()\n\n  return y\n}\n' },
  { name: 'a declaration right after a statement', rule: PADDING, code: 'export function f(g: () => number): number {\n  g()\n  const y = g()\n\n  return y\n}\n' },
  { name: 'a statement right after a let', rule: PADDING, code: 'export function f(g: () => number): number {\n  let y = g()\n  g()\n  y += g()\n\n  return y\n}\n' },
  { name: 'a let right after a statement', rule: PADDING, code: 'export function f(g: () => number): number {\n  g()\n  let y = g()\n\n  y += g()\n\n  return y\n}\n' },
  { name: 'a statement right after an export', rule: PADDING, code: 'export const items: number[] = []\nitems.push(1)\n' },
  { name: 'an export right after a statement', rule: PADDING, code: 'const items: number[] = []\n\nitems.push(1)\nexport const count = items.length\n' },
  { name: 'two functions without a blank line between them', rule: PADDING, code: 'function a(): number {\n  return 1\n}\nfunction b(): number {\n  return a()\n}\n\nexport const c = b\n' },
  { name: 'two exported functions without a blank line between them', rule: PADDING, code: 'export function a(): number {\n  return 1\n}\nexport function b(): number {\n  return a()\n}\n' },
  { name: 'a default-exported function right after a declaration', rule: PADDING, code: 'const one = 1\nexport default function f(): number {\n  return one\n}\n' },
  { name: 'a statement right after one that passes a block callback', rule: PADDING, code: 'export function f(g: (n: number) => void, items: number[]): void {\n  items.forEach(i => {\n    g(i)\n  })\n  g(0)\n}\n' },
  { name: 'a statement right before one that passes a block callback', rule: PADDING, code: 'export function f(g: (n: number) => void, items: number[]): void {\n  g(0)\n  items.forEach(function (i) {\n    g(i)\n  })\n}\n' },
  { name: 'a throw right after a statement', rule: PADDING, code: 'export function f(g: () => void): never {\n  g()\n  throw new Error(\'x\')\n}\n' },
  { name: 'a returned block callback right after a block', rule: PADDING, code: 'export function f(a: boolean, g: () => void): () => void {\n  if (a) {\n    g()\n  }\n  return () => {\n    g()\n  }\n}\n' },
  { name: 'a return right after a declaration in a component', rule: PADDING, code: 'export function F() {\n  const a = null\n  return a\n}\n', path: COMPONENT },
  { name: 'a blank line at the start of a block', rule: '@stylistic/padded-blocks', code: 'export function f(): number {\n\n  return 1\n}\n' },
  { name: 'a blank line at the start of a switch', rule: '@stylistic/padded-blocks', code: 'export function f(a: number): number {\n  switch (a) {\n\n    default:\n      return a\n  }\n}\n' },
  { name: 'a blank line at the start of a class', rule: '@stylistic/padded-blocks', code: 'export class A {\n\n  b = 1\n}\n' },
  { name: 'two blank lines in a row', rule: '@stylistic/no-multiple-empty-lines', code: 'export const a = 1\n\n\nexport const b = 2\n' },
  { name: 'a blank line at the start of a file', rule: '@stylistic/no-multiple-empty-lines', code: '\nexport const a = 1\n' },
  { name: 'a blank line at the end of a file', rule: '@stylistic/no-multiple-empty-lines', code: 'export const a = 1\n\n' },
  { name: 'an else after a return', rule: 'no-else-return', code: 'export function f(a: boolean): number {\n  if (a) {\n    return 1\n  } else {\n    return 2\n  }\n}\n' },
  { name: 'an else if after a return', rule: 'no-else-return', code: 'export function f(a: boolean, b: boolean): number {\n  if (a) {\n    return 1\n  } else if (b) {\n    return 2\n  }\n\n  return 3\n}\n' },
  { name: 'an if alone in an else', rule: 'no-lonely-if', code: 'export function f(a: boolean, b: boolean, g: () => void): void {\n  if (a) {\n    g()\n  } else {\n    if (b) {\n      g()\n    }\n  }\n}\n' },
  { name: 'a nested ternary', rule: 'no-nested-ternary', code: 'export const f = (a: boolean, b: boolean): number => (a ? 1 : b ? 2 : 3)\n' },
  { name: 'a let that is never reassigned', rule: 'prefer-const', code: 'export function f() {\n  let x = 1\n\n  return x\n}\n', path: SCRIPT },
  { name: 'a var', rule: 'no-var', code: 'export function f() {\n  var x = 1\n\n  return x\n}\n', path: SCRIPT },
  { name: 'a var in a JavaScript file', rule: 'no-var', code: 'export function f() {\n  var x = 1\n\n  return x\n}\n', path: 'scripts/example.js' },
  { name: 'a var in a CommonJS file', rule: 'no-var', code: 'function f() {\n  var x = 1\n\n  return x\n}\n\nmodule.exports = f\n', path: 'scripts/example.cjs' },
  { name: 'a loose equality', rule: 'eqeqeq', code: 'export const f = (a: unknown): boolean => a == 1\n' },
  { name: 'a loose typeof comparison', rule: 'eqeqeq', code: "export const f = (a: unknown): boolean => typeof a == 'string'\n" },
  { name: 'a to-do comment', rule: 'no-warning-comments', code: '// todo: later\nexport const a = 1\n' },
  { name: 'a fix-me word inside a comment', rule: 'no-warning-comments', code: '// Later, fixme\nexport const a = 1\n' },
  { name: 'an xxx word inside a comment', rule: 'no-warning-comments', code: '// Later, xxx\nexport const a = 1\n' },
  { name: 'a reassigned parameter', rule: 'no-param-reassign', code: 'export function f(a: number): number {\n  a = 2\n\n  return a\n}\n' },
  { name: 'an exported function without a return type', rule: '@typescript-eslint/explicit-module-boundary-types', code: 'export function f() {\n  return 1\n}\n' },
  { name: 'an exported function without a return type in an .mts module', rule: '@typescript-eslint/explicit-module-boundary-types', code: 'export function f() {\n  return 1\n}\n', path: TS_MODULE },
]
// What the block lets through on purpose: its relaxed padding, its rule options and the files it leaves out.
const ALLOWED: Sample[] = [
  { name: 'a run of declarations and a run of blocks', code: 'export function f(a: boolean, g: () => number): number {\n  const x = g()\n  const y = g()\n\n  if (a) {\n    g()\n  }\n  if (!a) {\n    g()\n  }\n\n  return x + y\n}\n' },
  { name: 'a run of const and let declarations', code: 'export function f(g: () => number): number {\n  const x = g()\n  let y = g()\n  const z = g()\n\n  y += x + z\n\n  return y\n}\n' },
  { name: 'a run of exported and plain constants', code: 'const a = 1\nexport const b = a\nexport const c = b\nconst d = c\nexport default d\n' },
  { name: 'a declaration that ends in a block right beside another declaration', code: 'export function f(g: () => number): number {\n  const h = (): number => {\n    return g()\n  }\n  const y = h()\n\n  return y\n}\n' },
  { name: 'a statement that passes an expression callback right beside another statement', code: 'export function f(g: (n: number) => void, items: number[]): void {\n  items.forEach(i => g(i))\n  g(0)\n}\n' },
  { name: 'a run of case labels', code: 'export function f(a: number): number {\n  switch (a) {\n    case 1:\n      return 1\n    case 2: {\n      return 2\n    }\n    default:\n      return 0\n  }\n}\n' },
  { name: 'a braced default before a case label', code: 'export function f(a: number): number {\n  switch (a) {\n    default: {\n      return 0\n    }\n    case 1:\n      return 1\n  }\n}\n' },
  { name: 'three levels of nesting and three parameters', code: 'export function f(a: boolean, b: boolean, c: boolean): number {\n  if (a) {\n    if (b) {\n      if (c) {\n        return 1\n      }\n    }\n  }\n\n  return 0\n}\n' },
  { name: 'three parameters in a script', code: 'export function f(a, b, c) {\n  return a + b + c\n}\n', path: SCRIPT },
  { name: 'a loose comparison with null', code: 'export const f = (a: unknown): boolean => a == null\n' },
  { name: 'a strict comparison with null', code: 'export const f = (a: unknown): boolean => a === null\n' },
  { name: 'a property set on a parameter', code: 'export function f(a: { b: number }): void {\n  a.b = 1\n}\n' },
  { name: 'a component without a return type', code: 'export function F() {\n  return null\n}\n', path: COMPONENT },
  { name: 'the vendored primitives with four parameters and no braces or blank lines', code: 'export function f(a: boolean, b: number, c: number, d: number): number {\n  if (a) return b\n  return c + d\n}\n', path: 'src/components/ui/example.tsx' },
]

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })

  return (result?.messages ?? []).map(m => m.ruleId ?? 'fatal')
}

describe('project lint rules', () => {
  it('bans sql.raw', async () => {
    const code = "const sql = { raw: (s: string) => s }\nexport const q = sql.raw('select 1')\n"

    expect(await ruleIds(code, 'src/server/db/example.ts')).toContain('no-restricted-syntax')
  })

  it('keeps the authored quote and semicolon style', async () => {
    expect(await ruleIds('export const a = "x";\n', EXAMPLE)).toEqual(expect.arrayContaining(['quotes', 'semi']))
  })

  it('lets an argument a signature demands go unused when its name starts with an underscore, and no other', async () => {
    expect(await ruleIds('export const act = (_previous: unknown, _form: FormData): number => 1\n', 'src/server/actions/example.ts')).toEqual([])
    expect(await ruleIds('export const act = (previous: unknown): number => 1\n', 'src/server/actions/example.ts')).toEqual(['@typescript-eslint/no-unused-vars'])
  })

  it('wants braces on every body and a blank line before a return', async () => {
    const code = 'export function f(x: number): number {\n  if (x) return 1\n  f(x - 1)\n  return x\n}\n'

    expect(await ruleIds(code, EXAMPLE)).toEqual(['curly', PADDING])
  })

  it('leaves the vendored ui primitives to their own style', async () => {
    expect(await ruleIds('export const a = "x";\n', 'src/components/ui/example.ts')).not.toContain('quotes')
  })

  it.each(BROKEN)('reports $name', async ({ rule, code, path = EXAMPLE }) => {
    expect(await ruleIds(code, path)).toEqual([rule])
  })

  it.each(ALLOWED)('allows $name', async ({ code, path = EXAMPLE }) => {
    expect(await ruleIds(code, path)).toEqual([])
  })
})
