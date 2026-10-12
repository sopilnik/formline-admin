import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['public/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'dist/**']),
  {
    // The authored style: single quotes, no semicolons. The vendored shadcn/ui
    // primitives keep the CLI's own style, so they stay out of this block.
    files: ['app/**', 'src/**', 'scripts/**', 'tests/**', 'db/**', '*.mjs', '*.mts', '*.ts'],
    ignores: ['src/components/ui/**'],
    rules: {
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'never'],
      // Never two blank lines in a row.
      'no-multiple-empty-lines': ['error', { max: 1 }],
    },
  },
  {
    // An argument a signature demands and the body leaves unused starts with an underscore: useActionState hands every
    // action the previous state and the form, wanted or not.
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // sql.raw splices text into SQL without binding it; every query goes through
    // the sql template or the query builder instead.
    files: ['**/*.{ts,tsx,mts,mjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='sql'][property.name='raw']",
          message: 'sql.raw bypasses parameter binding; use the sql template or the query builder',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['../*'], message: 'Use the @/ alias across src modules' }] },
      ],
    },
  },
])

export default eslintConfig
