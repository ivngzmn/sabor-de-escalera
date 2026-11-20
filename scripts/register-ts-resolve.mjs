// Lets plain Node load src/ modules that import siblings without a ".ts" suffix (as Astro and Vite allow).
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, URL } from 'node:url';

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && !/\.[a-z]+$/.test(specifier) && context.parentURL) {
    for (const suffix of ['.ts', '/index.ts']) {
      const url = new URL(specifier + suffix, context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
  }
  return next(specifier, context);
}

if (!globalThis.__tsResolveRegistered) {
  globalThis.__tsResolveRegistered = true;
  register(import.meta.url);
}
