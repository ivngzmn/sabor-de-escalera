import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('unavailable recipes show the left-the-table page in both languages', async ({ page }) => {
  // A malformed id is rejected before any database call, so this runs without one.
  const response = await page.goto('/recipes/not-a-recipe/anything');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oops—this recipe has left the table.');
  await expect(page.getByRole('link', { name: 'Explore Recipes' })).toHaveAttribute('href', '/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.goto('/recipes/not-a-recipe/x?lang=es');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Uy, esta receta se ha ido de la mesa.');
  await expect(page.getByRole('link', { name: 'Explorar recetas' })).toHaveAttribute('href', '/?lang=es');
});

test('a database outage is not reported as a missing recipe', async ({ page }) => {
  const response = await page.goto(`/recipes/${randomUUID()}/x`);
  expect(response?.status()).toBe(503);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/couldn’t load this recipe/i);
});

test('print hides site chrome and community areas', async ({ page }) => {
  await page.goto(`/recipes/${randomUUID()}/x`);
  await page.emulateMedia({ media: 'print' });
  for (const selector of ['.site-header', '.site-footer'])
    await expect(page.locator(selector).first()).toBeHidden();
  const printable = await page.evaluate(() => [...document.styleSheets].some((s) => {
    try { return [...s.cssRules].some((r) => r.cssText.includes('[data-print-hide]')); } catch { return false; }
  }));
  expect(printable).toBe(true);
});
