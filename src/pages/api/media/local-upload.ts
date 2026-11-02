import type { APIRoute } from 'astro';
import { handleLocalUpload } from '../../../features/media/routes';
export const POST: APIRoute = ({ request }) => handleLocalUpload(request);
