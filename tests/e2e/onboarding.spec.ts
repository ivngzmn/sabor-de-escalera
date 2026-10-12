import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('guest favorite intent survives sign-in and keeps Spanish', async ({ page }) => {
  await page.goto('/favorites?recipe=arroz&intent=favorite&lang=es');
  await expect(page).toHaveURL(/\/sign-in\?/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/favorites?recipe=arroz&intent=favorite&lang=es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});

test('unconfigured auth fails closed, blocks direct account mutations and admin access, while browsing works', async ({ page, request }) => {
  const response = await page.goto('/sign-in?returnTo=https://evil.example');
  expect(response?.status()).toBe(503);
  await expect(page.getByText('Sign-in is temporarily unavailable. Please try again later.')).toBeVisible();
  expect((await request.post('/onboarding', { headers: { Origin: 'http://127.0.0.1:4321' }, form: { displayName: 'Intruder', role: 'owner' } })).status()).toBe(503);
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
