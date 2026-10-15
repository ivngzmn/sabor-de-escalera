import type { APIRoute } from "astro";
import { handleDraftRequest } from "../../../features/recipes/routes";
export const GET: APIRoute = ({ request }) => handleDraftRequest(request);
export const POST: APIRoute = ({ request }) => handleDraftRequest(request);
