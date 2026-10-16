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

test('a real storage event withdraws memory-only choices in another tab', async ({ page, context }) => {
  await page.goto('/privacy');
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  const other = await context.newPage();
  try {
    await other.goto('/privacy');
    await expect(other.locator('astro-island')).not.toHaveAttribute('ssr', '');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'escalera:consent') throw new DOMException('Quota reached', 'QuotaExceededError'); original.call(this, key, value); };
    });
    await page.getByRole('button', { name: 'Accept optional', exact: true }).click();
    for (const name of ['Remember preferences', 'Local draft recovery', 'Usage analytics']) await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
    await page.evaluate(async () => {
      const modulePath = '/src/features/consent/service.ts';
      const service = await import(modulePath);
      for (const category of ['preferences', 'recovery', 'analytics']) {
        sessionStorage.setItem(`escalera:${category}:fixture`, 'optional');
        service.registerConsentCleanup(category, () => { document.body.setAttribute(`data-${category}-stopped`, String(!service.readConsent()[category])); });
      }
      sessionStorage.setItem('essential', 'retain');
      window.addEventListener('storage', (event) => { if (event.key === 'unrelated-app') document.body.dataset.unrelatedStorageSeen = 'true'; });
    });
    await other.evaluate(() => localStorage.setItem('unrelated-app', 'retain'));
    await expect(page.locator('body')).toHaveAttribute('data-unrelated-storage-seen', 'true');
    for (const name of ['Remember preferences', 'Local draft recovery', 'Usage analytics']) await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
    await other.getByRole('button', { name: 'Reject optional', exact: true }).click();
    for (const name of ['Remember preferences', 'Local draft recovery', 'Usage analytics']) await expect(page.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
    for (const category of ['preferences', 'recovery', 'analytics']) {
      await expect(page.locator('body')).toHaveAttribute(`data-${category}-stopped`, 'true');
      expect(await page.evaluate((category) => sessionStorage.getItem(`escalera:${category}:fixture`), category)).toBeNull();
    }
    expect(await page.evaluate(() => sessionStorage.getItem('essential'))).toBe('retain');
  } finally { await other.close(); }
});

test('floating preferences reopen saved choices, discard edits and restore focus', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Your privacy choices' });
  await panel.getByRole('button', { name: 'Reject optional', exact: true }).click();
  const launcher = page.getByRole('button', { name: 'Privacy preferences', exact: true });
  await expect(launcher).toBeVisible();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(launcher).toHaveAttribute('aria-expanded', 'true');
  const preferences = panel.getByRole('checkbox', { name: 'Remember preferences', exact: true });
  await expect(preferences).not.toBeChecked();
  await preferences.check();
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(preferences).not.toBeChecked();
  await preferences.check();
  await panel.getByRole('button', { name: 'Save privacy choices' }).click();
  await expect(launcher).toBeFocused();
  await page.reload();
  await launcher.click();
  await expect(preferences).toBeChecked();
  await preferences.uncheck();
  await panel.getByRole('button', { name: 'Close privacy preferences' }).click();
  await launcher.click();
  await expect(preferences).toBeChecked();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
});

test('floating notice fits a short mobile viewport and leaves essential choices explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 });
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Your privacy choices' });
  await expect(panel).toHaveCSS('position', 'fixed');
  await panel.getByRole('button', { name: 'Customize', exact: true }).click();
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
  await panel.getByRole('button', { name: 'Save privacy choices' }).click();
  await expect(panel).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Spanish launcher is localized and privacy page stays inline', async ({ page }) => {
  await page.goto('/?lang=es');
  await page.getByRole('button', { name: 'Rechazar opcionales', exact: true }).click();
  await page.getByRole('button', { name: 'Preferencias de privacidad', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Recordar preferencias', exact: true })).not.toBeChecked();
  await page.goto('/privacy?lang=es');
  await expect(page.getByRole('button', { name: 'Preferencias de privacidad', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar opciones de privacidad' })).toBeVisible();
});
