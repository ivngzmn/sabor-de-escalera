import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('guest favorite intent survives sign-in and keeps Spanish', async ({ page }) => {
  await page.goto('/favorites?recipe=arroz&intent=favorite&lang=es');
  await expect(page).toHaveURL(/\/sign-in\?/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/favorites?recipe=arroz&intent=favorite&lang=es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});

test('unconfigured auth fails closed, blocks direct account mutations and admin access, while browsing works', async ({ page, request, baseURL }) => {
  const response = await page.goto('/sign-in?returnTo=https://evil.example');
  expect(response?.status()).toBe(503);
  await expect(page.getByText('Sign-in is temporarily unavailable. Please try again later.')).toBeVisible();
  expect((await request.post('/onboarding', { headers: { Origin: baseURL! }, form: { displayName: 'Intruder', role: 'owner' } })).status()).toBe(503);
  expect((await request.post('/api/accounts/admin', { headers: { Origin: 'https://evil.example' }, form: { action: 'invite', email: 'intruder@example.com' } })).status()).toBe(403);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin sign-in' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});


test('account redirects and denied account pages cannot enter shared caches', async ({ request }) => {
  for (const path of ['/favorites?recipe=arroz&intent=favorite', '/add-recipe', '/sign-in', '/onboarding', '/admin']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.headers()['cache-control'], path).toBe('private, no-store');
  }
});

test('Clerk synchronization response reaches HTTP clients with redirect and independent cookies', async ({ request }) => {
  // This standalone harness injects only the external SDK state; it installs no
  // identity or test route in the Astro app and contacts no provider.
  const { createServer } = await import('node:http');
  const { createClerkAdapter } = await import('../../src/server/clerk');
  const { handleAccountRequest } = await import('../../src/server/account-request');
  const headers = new Headers({ Location: 'https://clerk.example/handshake' });
  headers.append('Set-Cookie', '__session=renewed; Path=/; HttpOnly; Secure');
  headers.append('Set-Cookie', '__client=renewed; Path=/; Expires=Thu, 01 Jan 2037 00:00:00 GMT; HttpOnly; Secure');
  const adapter = createClerkAdapter({
    authenticateRequest: async () => ({ status: 'handshake', headers, isAuthenticated: false, toAuth: () => ({ userId: null }) }),
    getUser: async () => { throw new Error('Handshake must not map a user'); },
  });
  const server = createServer(async (incoming, outgoing) => {
    const response = await handleAccountRequest(new Request(`http://127.0.0.1${incoming.url}`), async () => new Response('Sign-in required', { status: 401 }), adapter);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => { if (name !== 'set-cookie') outgoing.setHeader(name, value); });
    outgoing.setHeader('Set-Cookie', response.headers.getSetCookie());
    outgoing.end(await response.text());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP fixture did not bind');
    const response = await request.get(`http://127.0.0.1:${address.port}/onboarding`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()['location']).toBe('https://clerk.example/handshake');
    expect(response.headers()['cache-control']).toBe('private, no-store');
    expect(response.headersArray().filter((header) => header.name.toLowerCase() === 'set-cookie').map((header) => header.value)).toEqual(['__session=renewed; Path=/; HttpOnly; Secure', '__client=renewed; Path=/; Expires=Thu, 01 Jan 2037 00:00:00 GMT; HttpOnly; Secure']);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
