import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';

export default tseslint.config(
  // Global ignore patterns
  {
    ignores: [
      '**/node_modules/**',
      '**/.svelte-kit/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'apps/api/data/*'
    ]
  },

  // JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Svelte flat recommended configuration
  ...svelte.configs['flat/recommended'],

  // Svelte-specific: use svelte-eslint-parser with TS parser inside
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser
      }
    }
  },

  // Global language options (replaces env: { es2022: true, node: true, browser: true })
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },

  // Prettier integration — must be last to override formatting rules
  prettierConfig
);
