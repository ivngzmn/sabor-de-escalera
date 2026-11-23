import { expect, test } from 'vitest';
import { renderRobots, renderSitemap } from '../../src/features/recipes/sitemap';

test('robots allows the site, hides account and API paths, and points at the sitemap', () => {
  const robots = renderRobots('https://saborescalera.com');
  expect(robots).toContain('User-agent: *\nAllow: /');
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toContain('Disallow: /admin');
  expect(robots).toContain('Sitemap: https://saborescalera.com/sitemap.xml');
});

test('sitemap lists each page in English and Spanish with escaped URLs and alternates', () => {
  const xml = renderSitemap('https://saborescalera.com', [
    { path: '/' },
    { path: '/recipes/abc/pupusas-&-curtido', lastModified: '2026-11-01T12:00:00Z' },
  ]);
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  expect(xml).toContain('<loc>https://saborescalera.com/</loc>');
  expect(xml).toContain('<loc>https://saborescalera.com/?lang=es</loc>');
  expect(xml).toContain('<loc>https://saborescalera.com/recipes/abc/pupusas-&amp;-curtido</loc>');
  expect(xml).toContain('<lastmod>2026-11-01T12:00:00.000Z</lastmod>');
  expect(xml).toContain('hreflang="es" href="https://saborescalera.com/recipes/abc/pupusas-&amp;-curtido?lang=es"');
  expect(xml.match(/<url>/g)).toHaveLength(4);
});
