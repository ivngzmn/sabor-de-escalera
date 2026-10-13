import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

// Playwright sets FORCE_COLOR for workers; avoid conflicting inherited settings.
delete process.env.NO_COLOR;

const port = Number(process.env.E2E_PORT ?? 4321);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL,
    launchOptions: { channel: 'chrome' },
  },
  webServer: {
    command: `"${process.execPath}" "${resolve('node_modules/astro/bin/astro.mjs')}" dev --host 127.0.0.1 --port ${port} --ignore-lock`,
    url: `${baseURL}/@vite/client`,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: 'postgresql://server-secret-canary.invalid/example',
      CLERK_SECRET_KEY: 'server-secret-canary-clerk',
      RESEND_API_KEY: 'server-secret-canary-resend',
      IMAGEKIT_PRIVATE_KEY: 'server-secret-canary-imagekit',
      POSTHOG_PERSONAL_API_KEY: 'server-secret-canary-posthog',
    },
  },
});
