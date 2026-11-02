import type { APIRoute } from "astro";
import { handleCatalogRequest } from "../../../features/recipes/catalog-routes";
export const GET: APIRoute = ({ request }) => handleCatalogRequest(request);
