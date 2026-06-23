// @ts-check
// Shared flat-config base for every workspace. @stylistic owns all formatting -
// there is no prettier. Library packages (packages/*) use this config directly;
// apps/client imports `stylisticRules` and layers React + type-checked rules on
// top, so the formatting ruleset has a single home. There is no root `eslint .`;
// each package runs its own `eslint .` via `pnpm -r run lint`.
import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'

export const ignores = [
  '**/dist/**',
  '**/build/**',
  '**/node_modules/**',
  '**/coverage/**',
  '**/*.tsbuildinfo',
  '**/*.config.{js,ts,mjs}',
  '**/eslint.config.mjs'
]

// The single source of formatting truth (replaces prettier): no semicolons,
// single quotes, 2-space indent, no trailing whitespace, etc.
export const stylisticRules = {
  '@stylistic/space-in-parens': ['error'],
  '@stylistic/comma-spacing': ['error'],
  '@stylistic/no-multi-spaces': ['error'],
  '@stylistic/no-trailing-spaces': ['error'],
  '@stylistic/no-whitespace-before-property': ['error'],
  '@stylistic/array-bracket-newline': ['error', 'consistent'],
  '@stylistic/array-bracket-spacing': ['error'],
  '@stylistic/arrow-spacing': ['error'],
  '@stylistic/arrow-parens': ['error', 'always'],
  '@stylistic/block-spacing': ['error', 'always'],
  '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
  '@stylistic/comma-dangle': ['error', 'never'],
  '@stylistic/key-spacing': ['error'],
  '@stylistic/keyword-spacing': ['error'],
  '@stylistic/member-delimiter-style': ['error', { multiline: { delimiter: 'none' } }],
  '@stylistic/no-extra-semi': ['error'],
  '@stylistic/indent': ['error', 2],
  '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0, maxBOF: 0 }],
  '@stylistic/object-curly-spacing': ['error', 'always'],
  '@stylistic/quotes': ['error', 'single'],
  '@stylistic/semi': ['error', 'never'],
  '@stylistic/space-before-blocks': ['error', 'always'],
  '@stylistic/space-before-function-paren': [
    'error',
    { anonymous: 'always', named: 'never', asyncArrow: 'always' }
  ]
}

// Shared TypeScript hygiene that needs no type information.
export const tsRules = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      args: 'all',
      argsIgnorePattern: '^_',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true
    }
  ],
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-shadow': 'error'
}

// The complete config a plain TypeScript library uses (no React, no type-aware
// rules). apps/client does NOT spread this default - it composes the exports above.
export default tseslint.config(
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@stylistic': stylistic },
    rules: { ...stylisticRules, ...tsRules }
  }
)
