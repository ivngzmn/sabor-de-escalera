import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  { ignores: ['.astro/**', '.vercel/**', 'dist/**', 'node_modules/**', '.superpowers/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  { files: ['**/*.ts', '**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly' } } },
);
