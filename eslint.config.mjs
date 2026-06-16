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

  // Rule overrides for noisy/pedantic defaults from the ESLint 9 migration
  {
    rules: {
      // SvelteKit's app.d.ts uses empty interfaces for namespace augmentation
      '@typescript-eslint/no-empty-object-type': 'off',
      // Svelte reactivity uses bare expressions (e.g. `crosshairSnap;` in reactive blocks)
      '@typescript-eslint/no-unused-expressions': 'off',
      // Svelte 4 compat: new Map() patterns are fine
      'svelte/prefer-svelte-reactivity': 'off',
      // Legacy {#each} blocks without stable keys — adding keys is riskier than disabling
      'svelte/require-each-key': 'off'
    }
  },

  // Prettier integration — must be last to override formatting rules
  prettierConfig
);
