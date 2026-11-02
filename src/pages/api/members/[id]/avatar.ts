import type { APIRoute } from "astro";
import { mediaService } from "../../../../features/media/service";

// The URL names the asset (?v=<assetId>), so a browser may reuse it briefly; a new photo gets a new URL.
// Removal or moderation reaches a viewer who already loaded it within five minutes.
export const GET: APIRoute = async ({ params, url }) => {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const result = await mediaService().readMemberAvatar(params.id ?? "");
    if (!result.ok) return Response.json(result, { status: result.error.status, headers });
    const current = url.searchParams.get("v") === result.value.assetId;
    return new Response(new Uint8Array(result.value.bytes), {
      headers: {
        ...headers,
        ...(current ? { "Cache-Control": "private, max-age=300" } : {}),
        "Content-Type": "image/webp",
        "Content-Length": String(result.value.bytes.length),
      },
    });
  } catch {
    return Response.json({ ok: false, error: { status: 503, message: "Photo unavailable." } }, { status: 503, headers });
  }
};
