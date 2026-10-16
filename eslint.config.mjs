import stylistic from '@stylistic/eslint-plugin'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const VENDORED = ['src/components/ui/**']
// A function declaration and a statement that passes a block-bodied callback stand apart, from each other too.
const SET_APART = [
  'function',
  { selector: 'ExportNamedDeclaration[declaration.type="FunctionDeclaration"]' },
  { selector: 'ExportDefaultDeclaration[declaration.type="FunctionDeclaration"]' },
  { selector: 'ExpressionStatement:has(:function[body.type="BlockStatement"])' },
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['public/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'dist/**']),
  {
    // The authored style: single quotes, no semicolons. The vendored shadcn/ui
    // primitives keep the CLI's own style, so they stay out of this block.
    files: ['app/**', 'src/**', 'scripts/**', 'tests/**', 'db/**', '*.mjs', '*.mts', '*.ts'],
    ignores: VENDORED,
    rules: {
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'never'],
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
  {
    // Shallow nesting, at most three parameters, braces on every body and blank lines between the steps of a function.
    // The vendored primitives stay out, as above.
    files: ['**/*.{ts,tsx,js,mjs,cjs,mts}'],
    ignores: VENDORED,
    plugins: { '@stylistic': stylistic },
    rules: {
      'max-depth': ['error', { max: 3 }],
      'max-params': ['error', { max: 3 }],
      // The last matching entry wins: every `any` entry relaxes the `always` entries above it, and the entries below
      // it override it again.
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: '*', next: 'block-like' },
        { blankLine: 'any', prev: 'block-like', next: 'block-like' },
        { blankLine: 'any', prev: ['case', 'default'], next: ['case', 'default'] },
        { blankLine: 'always', prev: ['const', 'let', 'export'], next: '*' },
        { blankLine: 'always', prev: '*', next: ['const', 'let', 'export'] },
        { blankLine: 'any', prev: ['const', 'let', 'export'], next: ['const', 'let', 'export'] },
        { blankLine: 'always', prev: SET_APART, next: '*' },
        { blankLine: 'always', prev: '*', next: SET_APART },
        // Last, so that no `any` entry relaxes it: a `return () => { … }` after a block is block-like too.
        { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
      ],
      '@stylistic/padded-blocks': ['error', 'never'],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],
      curly: ['error', 'all'],
      'no-else-return': ['error', { allowElseIf: false }],
      'no-lonely-if': 'error',
      'no-nested-ternary': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx'], location: 'anywhere' }],
      'no-param-reassign': ['error', { props: false }],
    },
  },
  {
    files: ['**/*.{ts,tsx,mts}'],
    ignores: VENDORED,
    rules: {
      'max-params': 'off',
      '@typescript-eslint/max-params': ['error', { max: 3 }],
    },
  },
  {
    // Exported functions in .ts files state their types; React components keep the inferred return type.
    files: ['**/*.{ts,mts}'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'error' },
  },
])

export default eslintConfig
