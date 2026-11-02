import type { APIRoute } from "astro";
import { handleFavoriteRequest } from "../../../../features/recipes/catalog-routes";
export const PUT: APIRoute = ({ request, params }) => handleFavoriteRequest(request, params.id ?? "");
export const DELETE: APIRoute = ({ request, params }) => handleFavoriteRequest(request, params.id ?? "");
