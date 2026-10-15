import { cp, mkdir, realpath, readdir, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Astro virtual modules must keep their source package inside the fixture root.
// Copy real source files rather than pnpm's package symlinks, then give the copy
// the original package's dependency lookup directory (works with flat layouts too).
export async function fixtureDependencies(root: string, sourcePackages: string[]): Promise<void> {
  const modules = join(root, 'node_modules');
  await mkdir(modules);
  for (const name of await readdir('node_modules')) {
    // Each concurrent Astro harness owns its optimizer cache. Sharing .vite
    // replaces dependency hashes under other live servers and breaks hydration.
    if (['.vite', '.astro', '.cache'].includes(name)) continue;
    if (sourcePackages.some((pkg) => pkg.split('/')[0] === name)) {
      await mkdir(join(modules, name));
      for (const child of await readdir(resolve('node_modules', name))) {
        const pkg = `${name}/${child}`;
        const source = await realpath(resolve('node_modules', pkg));
        const target = join(modules, pkg);
        if (sourcePackages.includes(pkg)) {
          await cp(source, target, { recursive: true, dereference: true, filter: (path) => path !== join(source, 'node_modules') });
          await symlink(dirname(dirname(source)), join(target, 'node_modules'));
        } else await symlink(source, target);
      }
    } else await symlink(resolve('node_modules', name), join(modules, name));
  }
}
