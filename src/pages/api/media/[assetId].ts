import type { APIRoute } from 'astro';
import { handleMediaRead } from '../../../features/media/routes';
export const GET: APIRoute = ({ request, params }) => handleMediaRead(request, params.assetId ?? '');
