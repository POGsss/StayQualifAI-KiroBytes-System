// Flat ESLint config (ESLint 9) for the StayQualifAI backend.
// Enforces the steering rules: named exports only and no `any`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // No `any` — prefer `unknown` and narrow with type guards.
      '@typescript-eslint/no-explicit-any': 'error',
      // Prefer named exports over default exports.
      'import/no-default-export': 'error',
      'import/no-anonymous-default-export': 'error',
      // Require explicit return types on exported functions.
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Config files are allowed to use default exports.
  {
    files: ['*.config.js', '*.config.ts'],
    rules: {
      'import/no-default-export': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
  prettier
);
