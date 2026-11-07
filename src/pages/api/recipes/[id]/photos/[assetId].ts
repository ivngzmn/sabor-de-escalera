import type { APIRoute } from "astro";
import { mediaService } from "../../../../../features/media/service";
export const GET: APIRoute = async ({ params, url }) => {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const result = await mediaService().readRecipeDerivative(
      params.id ?? "",
      params.assetId ?? "",
      url.searchParams.get("variant") ?? "gallery",
    );
    if (!result.ok)
      return Response.json(result, { status: result.error.status, headers });
    return new Response(new Uint8Array(result.value), {
      headers: {
        ...headers,
        // Each viewer's browser may reuse a photo briefly. Hiding a recipe reaches anyone who already loaded it within five minutes.
        "Cache-Control": "private, max-age=300",
        "Content-Type": "image/webp",
        "Content-Length": String(result.value.length),
      },
    });
  } catch {
    return Response.json(
      { ok: false, error: { status: 503, message: "Photo unavailable." } },
      { status: 503, headers },
    );
  }
};
