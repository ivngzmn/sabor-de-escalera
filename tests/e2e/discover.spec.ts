import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('discover search keeps state in the URL and recovers from failures', async ({ page }) => {
  await page.goto('/');
  await page.locator('form[data-hydrated]').waitFor();
  const search = page.getByRole('searchbox', { name: /search recipes/i });
  await expect(search).toBeVisible();
  await search.fill('flan');
  await page.getByRole('button', { name: /^search$/i }).click();
  await expect(page).toHaveURL(/\?q=flan$/);
  // The e2e server has no database, so the feed must offer a retry rather than a blank list.
  await expect(page.getByRole('alert')).toContainText(/couldn’t load recipes/i);
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
});

test('discover filters are labelled controls that update the URL', async ({ page }) => {
  await page.goto('/');
  await page.locator('form[data-hydrated]').waitFor();
  const desserts = page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Desserts' });
  await desserts.click();
  await expect(page).toHaveURL(/category=desserts/);
  await expect(desserts).toHaveAttribute('aria-pressed', 'true');
  await page.getByText('More filters').click();
  await page.getByLabel('Dietary').selectOption('vegan');
  await expect(page).toHaveURL(/diet=vegan/);
  await page.getByLabel('Sort by').selectOption('rated');
  await expect(page).toHaveURL(/sort=rated/);
  await page.goto('/?lang=es');
  await expect(page.getByRole('searchbox', { name: /buscar recetas/i })).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`discover has no axe violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: /search recipes/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
  });
}
