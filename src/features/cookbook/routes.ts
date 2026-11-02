import { accounts } from "../accounts/service";
import { AccountError, assertSameOriginWrite } from "../accounts/permissions";
import { ClerkResponseError, accountConfiguration } from "../../server/clerk";
import { cookbookQueue } from "./queue";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, message: string) => Response.json({ ok: false, error: { status, message } }, { status, headers });

export async function handleCookbookAction(request: Request, entryId: string) {
  try {
    if (request.method !== "POST") return fail(405, "Method not allowed.");
    assertSameOriginWrite(request, accountConfiguration()?.origin ?? new URL(request.url).origin);
    const actor = await accounts().requireActor(request);
    const body = await request.json().catch(() => null);
    const queue = cookbookQueue();
    const output =
      body?.action === "review" ? await queue.markTextReviewed(actor, entryId)
      : body?.action === "publish" ? await queue.publishImported(actor, entryId)
      : null;
    if (!output) return fail(400, "Invalid request.");
    return Response.json(output, { status: output.ok ? 200 : output.error.status, headers });
  } catch (e) {
    if (e instanceof ClerkResponseError) return e.response;
    if (e instanceof AccountError) return fail(e.status, e.status === 401 ? "Sign-in required." : "Access denied.");
    return fail(503, "The cookbook queue is unavailable. Please retry.");
  }
}
