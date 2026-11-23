import type { APIRoute } from 'astro';
import { accountConfiguration } from '../server/clerk';
import { catalogService } from '../features/recipes/catalog';
import { STATIC_SITEMAP_PATHS, renderSitemap, type SitemapEntry } from '../features/recipes/sitemap';

export const GET: APIRoute = async ({ url }) => {
  const origin = accountConfiguration()?.origin ?? url.origin;
  // A database outage still serves the static pages rather than failing the whole sitemap.
  const recipes: SitemapEntry[] = await catalogService().sitemapEntries().catch(() => []);
  const entries = [...STATIC_SITEMAP_PATHS.map((path) => ({ path })), ...recipes];
  return new Response(renderSitemap(origin, entries), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
