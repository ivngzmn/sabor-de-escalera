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

test('discover filters are chips and a panel that update the URL', async ({ page }) => {
  await page.goto('/');
  await page.locator('form[data-hydrated]').waitFor();
  const desserts = page.getByRole('group', { name: 'Category' }).getByRole('button', { name: 'Desserts' });
  await desserts.click();
  await expect(page).toHaveURL(/category=desserts/);
  await expect(desserts).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Dietary').selectOption('vegan');
  await expect(page).toHaveURL(/diet=vegan/);
  await page.getByLabel('Sort by').selectOption('rated');
  await expect(page).toHaveURL(/sort=rated/);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/\?sort=rated$/);
});

test('clear filters keeps the search text', async ({ page }) => {
  await page.goto('/?q=flan&diet=vegan');
  await page.locator('form[data-hydrated]').waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\?q=flan$/);
});

test('the filter panel applies on confirm and discards on escape or cancel', async ({ page }) => {
  await page.goto('/');
  await page.locator('form[data-hydrated]').waitFor();
  const trigger = page.getByRole('button', { name: /^filters/i });
  const panel = page.getByRole('dialog', { name: 'Filters' });
  // Escape discards.
  await trigger.click();
  await panel.getByRole('radio', { name: '30 min' }).click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/time=/);
  // Reopening shows the current, unchanged values.
  await trigger.click();
  await expect(panel.getByRole('radio', { name: 'Any' })).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByRole('radio', { name: '30 min' })).toHaveAttribute('aria-checked', 'false');
  // Cancel discards.
  await panel.getByRole('radio', { name: '2 h' }).click();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();
  await expect(page).not.toHaveURL(/time=/);
  // Apply applies.
  await trigger.click();
  await panel.getByRole('radio', { name: '1 h' }).click();
  await panel.getByRole('button', { name: 'Vegan' }).click();
  await panel.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/time=60&diet=vegan|diet=vegan.*time=60|time=60.*diet=vegan/);
  await expect(page.getByRole('button', { name: 'Filters · 2' })).toBeVisible();
  await page.goto('/?lang=es');
  await page.locator('form[data-hydrated]').waitFor();
  await page.getByRole('button', { name: /^filtros/i }).click();
  await expect(page.getByRole('dialog', { name: 'Filtros' }).getByRole('button', { name: 'Aplicar filtros' })).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`discover has no axe violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: /search recipes/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
    await page.locator('form[data-hydrated]').waitFor();
    await page.getByRole('button', { name: /^filters/i }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    const open = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(open.violations).toEqual([]);
  });

  test(`discover keeps the Search button named at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^search$/i })).toBeVisible();
  });
}
