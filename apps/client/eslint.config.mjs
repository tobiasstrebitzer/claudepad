// The client layers React + type-checked rules on the shared base. Formatting
// (@stylistic) comes from eslint.config.base.mjs so it has one home; there is no
// prettier and no root `eslint .`.
import eslint from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import { stylisticRules } from '../../eslint.config.base.mjs'

export default defineConfig(eslint.configs.recommended, tseslint.configs.recommendedTypeChecked, tseslint.configs.stylisticTypeChecked, {
  languageOptions: {
    parserOptions: {
      project: 'tsconfig.json',
      tsconfigRootDir: import.meta.dirname,
      ecmaFeatures: { jsx: true }
    }
  },
  plugins: {
    '@stylistic': stylistic,
    'jsx-a11y': jsxA11y,
    'react': react,
    'react-hooks': reactHooks
  },
  rules: {
    ...stylisticRules,
    '@typescript-eslint/adjacent-overload-signatures': 'error',
    '@typescript-eslint/array-type': 'off',
    '@typescript-eslint/await-thenable': 'off',
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/consistent-type-assertions': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-member-accessibility': 'off',
    '@typescript-eslint/no-angle-bracket-type-assertion': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    '@typescript-eslint/no-extra-non-null-assertion': 'error',
    '@typescript-eslint/no-floating-promises': 'off',
    '@typescript-eslint/no-misused-new': 'error',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-object-literal-type-assertion': 'off',
    '@typescript-eslint/no-parameter-properties': 'off',
    '@typescript-eslint/no-shadow': 'error',
    '@typescript-eslint/no-triple-slash-reference': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      'args': 'all',
      'argsIgnorePattern': '^_',
      'caughtErrors': 'all',
      'caughtErrorsIgnorePattern': '^_',
      'destructuredArrayIgnorePattern': '^_',
      'varsIgnorePattern': '^_',
      'ignoreRestSiblings': true
    }],
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/prefer-for-of': 'error',
    '@typescript-eslint/prefer-interface': 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'off',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/return-await': 'off',
    '@typescript-eslint/unified-signatures': 'error',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/dot-notation': 'off',
    '@typescript-eslint/prefer-regexp-exec': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/only-throw-error': ['error', {
      'allow': [
        { from: 'lib', name: 'Response' },
        { from: 'package', package: 'react-router', name: 'DataWithResponseInit' }
      ]
    }],
    'jsx-a11y/no-autofocus': ['error', { 'ignoreNonDOM': true }],
    'jsx-a11y/aria-role': ['error', { 'ignoreNonDOM': true }],
    '@typescript-eslint/no-base-to-string': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off'
  }
}, {
  files: ['eslint.config.mjs'],
  extends: [tseslint.configs.disableTypeChecked]
}, {
  ignores: ['dist', 'node_modules', '**/vite.config.ts', '**/vitest.config.ts', '**/playwright.config.ts', '**/test', '**/*.test.tsx', '**/*.test.ts', '**/*.mjs', 'e2e']
})
