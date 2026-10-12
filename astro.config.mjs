import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel({ imageService: false, isr: false }),
  integrations: [react()],
  vite: {
    plugins: [{
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
