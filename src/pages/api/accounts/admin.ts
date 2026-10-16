import type { APIRoute } from 'astro';
import { handleAdminWrite } from '../../../features/accounts/routes';
export const POST: APIRoute = ({ request }) => handleAdminWrite(request);
