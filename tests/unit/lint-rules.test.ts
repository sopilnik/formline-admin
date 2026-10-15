import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const eslint = new ESLint()

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
    expect(await ruleIds('export const a = "x";\n', 'src/lib/example.ts')).toEqual(expect.arrayContaining(['quotes', 'semi']))
  })

  it('lets an argument a signature demands go unused when its name starts with an underscore, and no other', async () => {
    expect(await ruleIds('export const act = (_previous: unknown, _form: FormData) => 1\n', 'src/server/actions/example.ts')).toEqual([])
    expect(await ruleIds('export const act = (previous: unknown) => 1\n', 'src/server/actions/example.ts')).toEqual(['@typescript-eslint/no-unused-vars'])
  })

  it('leaves the vendored ui primitives to their own style', async () => {
    expect(await ruleIds('export const a = "x";\n', 'src/components/ui/example.ts')).not.toContain('quotes')
  })
})
