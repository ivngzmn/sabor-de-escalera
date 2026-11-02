import { accounts } from "../accounts/service";
import { AccountError, assertSameOriginWrite } from "../accounts/permissions";
import { ClerkResponseError, accountConfiguration } from "../../server/clerk";
import { translationService } from "./service";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, message: string) => Response.json({ ok: false, error: { status, message } }, { status, headers });

export async function handleTranslationRequest(request: Request, recipeId: string) {
  try {
    if (request.method !== "GET") assertSameOriginWrite(request, accountConfiguration()?.origin ?? new URL(request.url).origin);
    const actor = await accounts().requireActor(request);
    const svc = translationService();
    if (request.method === "GET") {
      const output = await svc.readForReview(actor, recipeId);
      return Response.json(output, { status: output.ok ? 200 : output.error.status, headers });
    }
    if (request.method !== "POST") return fail(405, "Method not allowed.");
    if (Number(request.headers.get("content-length") ?? 0) > 200_000) return fail(413, "Translation is too large.");
    const body = await request.json().catch(() => null);
    const output =
      body?.action === "save"
        ? await svc.saveTranslation(actor, recipeId, body.language, Number(body.sourceVersion), body.input)
        : body?.action === "approve"
          ? await svc.approveTranslations(actor, body.items)
          : null;
    if (!output) return fail(400, "Invalid request.");
    return Response.json(output, { status: output.ok ? 200 : output.error.status, headers });
  } catch (e) {
    if (e instanceof ClerkResponseError) return e.response;
    if (e instanceof AccountError) return fail(e.status, e.status === 401 ? "Sign-in required." : "Access denied.");
    return fail(503, "Translations are unavailable. Please retry.");
  }
}
