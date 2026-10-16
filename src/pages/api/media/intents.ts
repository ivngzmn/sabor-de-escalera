import type { APIRoute } from 'astro';
import { handleMediaWrite } from '../../../features/media/routes';
export const POST: APIRoute = ({ request }) => handleMediaWrite(request, 'intents');
