import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('equal choices, scrolling and dismissal never opt in; settings persist explicit decisions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  const banner = page.getByRole('region', { name: 'Your privacy choices' });
  await expect(banner).toBeVisible();
  const actions = ['Accept optional', 'Reject optional', 'Customize'];
  for (const name of actions) await expect(banner.getByRole('button', { name, exact: true })).toBeVisible();
  const styles = await Promise.all(actions.map((name) => banner.getByRole('button', { name, exact: true }).evaluate((button) => { const style = getComputedStyle(button); return [style.backgroundColor, style.color, style.minHeight]; })));
  expect(styles[1]).toEqual(styles[0]); expect(styles[2]).toEqual(styles[0]);
  await page.mouse.wheel(0, 900); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await banner.getByRole('button', { name: 'Customize', exact: true }).click();
  for (const name of ['Remember preferences', 'Local draft recovery', 'Usage analytics']) await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Save privacy choices' }).click();
  await expect(banner).not.toBeVisible();
  await page.reload(); await expect(banner).not.toBeVisible();
  await page.getByRole('link', { name: 'Privacy settings', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Remember preferences', exact: true }).check();
  await page.getByRole('button', { name: 'Save privacy choices' }).click();
  const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('escalera:consent')!));
  expect(consent).toMatchObject({ version: 1, preferences: true, recovery: false, analytics: false });
  expect(Object.keys(consent).sort()).toEqual(['analytics', 'preferences', 'recovery', 'updatedAt', 'version']);
  await page.getByRole('button', { name: 'Reject optional', exact: true }).click();
  await page.reload(); await expect(page.getByRole('checkbox', { name: 'Remember preferences', exact: true })).not.toBeChecked();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});

test('accept is explicit, Spanish purposes available, and optional providers never load', async ({ page, baseURL }) => {
  const external: string[] = [];
  page.on('request', (request) => { if (!request.url().startsWith(`${baseURL}/`)) external.push(request.url()); });
  await page.goto('/?lang=es');
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  await expect(page.getByRole('region', { name: 'Tus opciones de privacidad' })).toBeVisible();
  await page.getByRole('button', { name: 'Aceptar opcionales', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('escalera:consent')!))).toMatchObject({ preferences: true, recovery: true, analytics: true });
  await page.reload();
  expect(external).toEqual([]);
});

test('withdrawal stops capture and clears only optional owned storage in the real app', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  await page.getByRole('button', { name: 'Accept optional', exact: true }).click();
  await page.evaluate(async () => {
    const modulePath = '/src/features/consent/service.ts';
    const module = await import(modulePath);
    module.registerConsentCleanup('analytics', () => { document.body.dataset.captureStopped = String(!module.readConsent().analytics); });
    for (const storage of [localStorage, sessionStorage]) {
      storage.setItem('escalera:recovery:fixture:draft', 'draft text');
      storage.setItem('escalera:preferences:language', 'es');
      storage.setItem('escalera:analytics:session', 'opaque');
      storage.setItem('unrelated-app', 'retain');
    }
  });
  await page.getByRole('button', { name: 'Reject optional', exact: true }).click();
  expect(await page.evaluate(() => document.body.dataset.captureStopped)).toBe('true');
  expect(await page.evaluate(() => [localStorage, sessionStorage].map((storage) => ({ recovery: storage.getItem('escalera:recovery:fixture:draft'), preferences: storage.getItem('escalera:preferences:language'), analytics: storage.getItem('escalera:analytics:session'), unrelated: storage.getItem('unrelated-app') })))).toEqual([{ recovery: null, preferences: null, analytics: null, unrelated: 'retain' }, { recovery: null, preferences: null, analytics: null, unrelated: 'retain' }]);
});

test('controls wait for hydration and current stored choices before accepting input', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await context.newPage();
  try {
    await staticPage.goto(`${baseURL}/privacy`);
    await expect(staticPage.getByRole('button', { name: 'Save privacy choices' })).toBeDisabled();
    await expect(staticPage.getByRole('button', { name: 'Accept optional', exact: true })).toBeDisabled();
  } finally { await context.close(); }
  await page.goto('/privacy');
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  await expect(page.getByRole('button', { name: 'Save privacy choices' })).toBeEnabled();
});

test('privacy settings with a trailing slash mounts only one consent control', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.locator('astro-island')).toHaveCount(1);
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  await expect(page.getByRole('button', { name: 'Reject optional', exact: true })).toHaveCount(1);
});
