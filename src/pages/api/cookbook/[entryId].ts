import type { APIRoute } from "astro";
import { handleCookbookAction } from "../../../features/cookbook/routes";
export const POST: APIRoute = ({ request, params }) => handleCookbookAction(request, params.entryId ?? "");
