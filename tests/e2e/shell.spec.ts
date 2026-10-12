import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('unknown routes including inherited object names return HTTP 404', async ({ page }) => {
  for (const path of ['/constructor', '/toString', '/__proto__', '/not-a-page']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  }
});

for (const [name, width, height] of [
  ['phone', 390, 844], ['tablet', 768, 1024], ['desktop', 1440, 900],
] as const) {
  test(`${name}: guest navigation, languages, footer and keyboard focus`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(navigation.getByRole('link', { name: 'Discover', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Add Recipe' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Favorites' })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Privacy settings' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    const language = page.getByRole('navigation', { name: 'Language' });
    await expect(language.getByRole('link', { name: 'English', exact: true })).toBeVisible();
    await language.getByRole('link', { name: 'Español', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('link', { name: 'Descubrir', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'English', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.getByRole('link', { name: 'Add Recipe', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/add-recipe');
    await page.getByRole('link', { name: 'Favorites', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/favorites');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy settings' }).click();
    await expect(page.getByRole('heading', { name: 'Privacy settings' })).toBeVisible();
  });
}

test('disabled providers and consent-free shell make no external calls or optional storage', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4321/')) external.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await page.getByRole('link', { name: 'Español', exact: true }).click();
  expect(external).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie }))).toEqual({ local: 0, session: 0, cookie: '' });
});

test('server secret canaries do not enter HTML or browser-loaded assets', async ({ page }) => {
  const assets: Promise<string>[] = [];
  page.on('response', (response) => {
    if (/javascript|text\/html|text\/css/.test(response.headers()['content-type'] ?? '')) assets.push(response.text());
  });
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  for (const body of await Promise.all(assets)) expect(body).not.toContain('server-secret-canary');
});
