import type { APIRoute } from "astro";
import { handleTranslationRequest } from "../../../features/translations/routes";
export const GET: APIRoute = ({ request, params }) => handleTranslationRequest(request, params.recipeId ?? "");
export const POST: APIRoute = ({ request, params }) => handleTranslationRequest(request, params.recipeId ?? "");
