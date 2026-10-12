import { defineConfig } from '@playwright/test';

// Playwright sets FORCE_COLOR for workers; avoid conflicting inherited settings.
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    launchOptions: { channel: 'chrome' },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --ignore-lock',
    url: 'http://127.0.0.1:4321/@vite/client',
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
