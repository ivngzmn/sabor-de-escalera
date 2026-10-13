import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

const selectors = ['.brand', '.header-inner', 'h1', '.intro'];
const geometry = (page: Page) => page.evaluate((targets) => targets.map((selector) => {
  const element = document.querySelector(selector)!;
  const box = element.getBoundingClientRect();
  const text = document.createRange();
  text.selectNodeContents(element);
  return { selector, height: box.height, y: box.y + scrollY, textWidth: text.getBoundingClientRect().width, fontSize: getComputedStyle(element).fontSize };
}), selectors);
const painted = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const textInk = async (page: Page, selector: string) => {
  const clip = await page.locator(selector).boundingBox();
  const session = await page.context().newCDPSession(page);
  try {
    // CDP captures the current paint; Playwright screenshots wait for fonts.ready.
    const { data } = await session.send('Page.captureScreenshot', { format: 'png', clip: { ...clip!, scale: 1 } });
    const { channels } = await sharp(Buffer.from(data, 'base64')).stats();
    return Math.max(...channels.slice(0, 3).map((channel) => channel.stdev));
  } finally { await session.detach(); }
};

for (const width of [390, 1440]) for (const language of ['en', 'es']) {
  test(`${width}px ${language}: cold fonts paint without fallback text and subsequent navigation preserves geometry`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const requests: string[] = [];
    await page.route(/\.woff2?(\?|$)/, async (route) => {
      requests.push(route.request().url());
      await gate;
      await route.continue();
    });
    try {
      await page.goto(`/?lang=${language}`, { waitUntil: 'domcontentloaded' });
      // Hold real font responses inside the browser's bounded font block period.
      await page.waitForTimeout(400);
      await painted(page);
      await expect(page.locator('h1')).toBeVisible();
      // The heading/body are briefly withheld by the font face, while the page is rendered.
      expect(await textInk(page, 'h1')).toBeLessThan(1);
      expect(await textInk(page, '.intro')).toBeLessThan(1);
      release();
      await page.evaluate(() => document.fonts.ready);
      await painted(page);
      expect(await textInk(page, 'h1')).toBeGreaterThan(1);
      expect(await textInk(page, '.intro')).toBeGreaterThan(1);
      const home = await geometry(page);
      await page.getByRole('contentinfo').getByRole('link', { name: language === 'es' ? 'Acerca de' : 'About', exact: true }).click();
      await page.getByRole('link', { name: 'Sabor de Escalera', exact: true }).click();
      await painted(page);
      expect(await geometry(page)).toEqual(home);
      // Routing disables the browser cache; each page still requests each face only once.
      expect(requests).toHaveLength(9);
      expect(new Set(requests).size).toBe(3);
      expect(requests.every((url) => url.endsWith('.woff2'))).toBe(true);
    } finally { release(); }
  });

  test(`${width}px ${language}: font preloads are reused and warm navigation keeps typography stable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fonts: string[] = [];
    page.on('request', (request) => { if (/\.woff2?(\?|$)/.test(request.url())) fonts.push(request.url()); });
    await page.goto(`/?lang=${language}`);
    await page.evaluate(() => document.fonts.ready);
    const preloads = await page.locator('link[rel="preload"][as="font"]').evaluateAll((links) => links.map((link) => {
      const preload = link as HTMLLinkElement;
      return { href: preload.href, type: preload.type, cors: preload.crossOrigin };
    }));
    expect(preloads).toHaveLength(3);
    for (const preload of preloads) {
      expect(preload.type).toBe('font/woff2');
      expect(preload.cors).toBe('anonymous');
      expect(fonts.filter((url) => url === preload.href)).toHaveLength(1);
    }
    expect(fonts).toHaveLength(3);
    expect(await page.evaluate(() => [...document.fonts].map((font) => [font.family, font.weight, font.status]))).toEqual([
      ['Playfair Display', '600', 'loaded'], ['Plus Jakarta Sans', '400', 'loaded'], ['Plus Jakarta Sans', '600', 'loaded'],
    ]);
    expect(await page.evaluate(() => document.fonts.check('600 24px "Playfair Display"', 'Español áéíóúüñ¿¡') && document.fonts.check('400 16px "Plus Jakarta Sans"', 'Español áéíóúüñ¿¡'))).toBe(true);
    const home = await geometry(page);
    await page.getByRole('contentinfo').getByRole('link', { name: language === 'es' ? 'Acerca de' : 'About', exact: true }).click();
    await page.getByRole('link', { name: 'Sabor de Escalera', exact: true }).click();
    await painted(page);
    const firstPaint = await geometry(page);
    await page.evaluate(() => document.fonts.ready);
    await painted(page);
    expect(await geometry(page)).toEqual(firstPaint);
    expect(firstPaint).toEqual(home);
  });
}

test('failed fonts leave readable EN/ES pages and keyboard navigation', async ({ page }) => {
  await page.route(/\.woff2?(\?|$)/, (route) => route.abort('failed'));
  for (const language of ['en', 'es']) {
    await page.goto(`/?lang=${language}`);
    await page.evaluate(() => document.fonts.ready);
    const before = await geometry(page);
    expect(await textInk(page, 'h1')).toBeGreaterThan(1);
    expect(await textInk(page, '.intro')).toBeGreaterThan(1);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.locator('h1').evaluate((heading) => getComputedStyle(heading).opacity)).toBe('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: language === 'es' ? 'Saltar al contenido' : 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await painted(page);
    expect(await geometry(page)).toEqual(before);
  }
});


test('a stalled font becomes readable after the native block budget', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\.woff2(\?|$)/, async (route) => { await gate; await route.abort('failed'); });
  try {
    await page.goto('/?lang=es', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3400);
    await painted(page);
    expect(await textInk(page, 'h1')).toBeGreaterThan(1);
    expect(await textInk(page, '.intro')).toBeGreaterThan(1);
    await expect(page.getByRole('link', { name: 'Descubrir', exact: true })).toBeVisible();
  } finally { release(); }
});
