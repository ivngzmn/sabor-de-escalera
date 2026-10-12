import { defineMiddleware } from 'astro:middleware';
export const onRequest = defineMiddleware(async ({ url }, next) => {
  const response = await next();
  if (/^\/(?:sign-in|onboarding|admin|favorites|add-recipe|api\/accounts)(?:\/|$)/.test(url.pathname)) {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
});
