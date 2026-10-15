import type { APIRoute } from "astro";
import { handleDraftRequest } from "../../../features/recipes/routes";
export const GET: APIRoute = ({ request, params }) =>
  handleDraftRequest(request, params.id);
export const POST: APIRoute = ({ request, params }) =>
  handleDraftRequest(request, params.id);
export const DELETE: APIRoute = ({ request, params }) =>
  handleDraftRequest(request, params.id);
