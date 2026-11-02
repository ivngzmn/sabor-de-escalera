import type { APIRoute } from "astro";
import { handleTranslationRequest } from "../../../features/translations/routes";
// Bulk approval: the body names each translation and the recipe version it was written for.
export const POST: APIRoute = ({ request }) => handleTranslationRequest(request, "");
