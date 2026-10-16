import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import clerk from '@clerk/astro';
import { loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
const environment = { ...loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), ''), ...process.env };
const clerkConfigured = Boolean(environment.PUBLIC_CLERK_PUBLISHABLE_KEY && environment.CLERK_SECRET_KEY && environment.DATABASE_URL && environment.APP_ORIGIN && environment.CLERK_EMAIL_CODE_CONFIGURED === 'true');
const clerkIntegration = clerk({ telemetry: { disabled: true } });
const configureClerk = clerkIntegration.hooks['astro:config:setup'];
clerkIntegration.hooks['astro:config:setup'] = (context) => configureClerk({
  ...context,
  // Register Clerk's virtual modules and types, but omit SDK initialization until configured.
  injectScript: clerkConfigured ? context.injectScript : () => {},
});

export default defineConfig({
  output: 'server',
  adapter: vercel({ imageService: false, isr: false }),
  integrations: [react(), clerkIntegration],
  vite: {
    plugins: [tailwindcss(), {
      name: 'server-module-boundary',
      enforce: 'pre',
      transform(_code, id, options) {
        if (!options?.ssr && id.replaceAll('\\', '/').includes('/src/server/')) {
          throw new Error('Server modules cannot be imported by client code');
        }
      },
    }],
  },
  devToolbar: { enabled: false },
});
