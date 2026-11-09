import { readFile } from 'node:fs/promises';
import { getPool } from '../src/server/db.ts';
import { parseManifest } from '../src/features/cookbook/manifest.ts';
import { importCookbook } from '../src/features/cookbook/importer.ts';

// Usage: pnpm cookbook:import <manifest.json> [--confirm-backup]
// The manifest holds book text and must stay outside Git (reference/ is ignored).
const [path, flag] = process.argv.slice(2);
if (!path) throw new Error('Pass the local manifest path, e.g. reference/cookbook/manifest.json');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (put it in .env or export it).');
const host = new URL(process.env.DATABASE_URL).hostname;
if (!['127.0.0.1', 'localhost'].includes(host) && flag !== '--confirm-backup')
  throw new Error('Refusing to import into a non-local database without --confirm-backup (take a backup first).');
const parsed = parseManifest(JSON.parse(await readFile(path, 'utf8')));
if (!parsed.ok) throw new Error(`Manifest rejected: ${parsed.error.message}`);
const pool = getPool();
try {
  const summary = await importCookbook(pool, parsed.value);
  console.log(`Cookbook staged: ${parsed.value.length} entries (${summary.created} new, ${summary.updated} updated, ${summary.skippedReviewed} kept because already reviewed).`);
} finally { await pool.end(); }
