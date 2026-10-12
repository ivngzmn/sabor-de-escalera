import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, expect, test } from 'vitest';

const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'escalera-foundation-build-'));
await cp('src', join(root, 'src'), { recursive: true });
for (const file of ['astro.config.mjs', 'package.json', 'tsconfig.json']) await cp(file, join(root, file));
await mkdir(join(root, 'node_modules'));
// Astro source packages must resolve inside the fixture root: a whole-directory
// symlink puts Clerk .astro virtual scripts outside Astro 7's metadata cache.
for (const dependency of await readdir('node_modules')) {
  const source = resolve('node_modules', dependency);
  const target = join(root, 'node_modules', dependency);
  if (dependency === '@clerk') await cp(source, target, { recursive: true });
  else await symlink(source, target);
}
afterAll(() => rm(root, { recursive: true, force: true }));

async function readAssets(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readAssets(path);
    if (/\.(?:js|css|html|json)$/.test(entry.name)) return [await readFile(path, 'utf8')];
    return [];
  }))).flat();
}

test('production client assets contain no server secrets, even when configured at build', async () => {
  await exec(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: 'server-secret-canary-database', RESEND_API_KEY: 'server-secret-canary-resend', CLERK_SECRET_KEY: 'server-secret-canary-clerk', PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_Y2xlcmsuZXhhbXBsZSQ=', APP_ORIGIN: 'https://recipes.example', CLERK_EMAIL_CODE_CONFIGURED: 'true', PUBLIC_CLERK_KEYLESS_DISABLED: 'true' },
  });
  for (const asset of await readAssets(join(root, '.vercel/output/static'))) expect(asset).not.toContain('server-secret-canary');
}, 60000);

test('a client import of server configuration is rejected at build', async () => {
  await writeFile(join(root, 'src/pages/client-boundary.astro'), '<script>import { readServerConfig } from "../server/config"; console.log(readServerConfig());</script>');
  const result = await exec(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], { cwd: root })
    .then(() => 'build unexpectedly succeeded')
    .catch((error: { stdout: string; stderr: string }) => error.stdout + error.stderr);
  expect(result).toContain('Server modules cannot be imported by client code');
}, 60000);
