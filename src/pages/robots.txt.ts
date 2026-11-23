import type { APIRoute } from 'astro';
import { accountConfiguration } from '../server/clerk';
import { renderRobots } from '../features/recipes/sitemap';

export const GET: APIRoute = ({ url }) =>
  new Response(renderRobots(accountConfiguration()?.origin ?? url.origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
