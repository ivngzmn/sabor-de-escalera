/** Public pages crawlers and URL categorizers may index. Recipes are added from the catalog. */
export const STATIC_SITEMAP_PATHS = ['/', '/discover', '/about', '/privacy'] as const;

/** Account, admin and API paths stay out of indexes; they need a session or return JSON. */
export const DISALLOWED_PATHS = ['/api/', '/admin', '/profile', '/onboarding', '/sign-in', '/add-recipe', '/favorites'] as const;

export interface SitemapEntry {
  path: string;
  lastModified?: string | null;
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

function localized(origin: string, path: string) {
  const en = new URL(path, origin).href;
  const es = new URL(`${path}?lang=es`, origin).href;
  return { en, es };
}

/** Each page is listed in English and Spanish, with hreflang alternates linking the pair. */
export function renderSitemap(origin: string, entries: SitemapEntry[]): string {
  const urls = entries.flatMap(({ path, lastModified }) => {
    const { en, es } = localized(origin, path);
    const alternates = [
      `<xhtml:link rel="alternate" hreflang="en" href="${escapeXml(en)}"/>`,
      `<xhtml:link rel="alternate" hreflang="es" href="${escapeXml(es)}"/>`,
      `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(en)}"/>`,
    ].join('');
    const lastmod = lastModified ? `<lastmod>${new Date(lastModified).toISOString()}</lastmod>` : '';
    return [en, es].map((loc) => `<url><loc>${escapeXml(loc)}</loc>${lastmod}${alternates}</url>`);
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function renderRobots(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${new URL('/sitemap.xml', origin).href}`,
    '',
  ].join('\n');
}
