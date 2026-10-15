import { accounts, type createAccountService } from "../accounts/service";
import { AccountError, assertSameOriginWrite } from "../accounts/permissions";
import { ClerkResponseError, accountConfiguration } from "../../server/clerk";
import { DraftError, draftsService, type createDraftService } from "./drafts";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
interface Dependencies {
  accounts: ReturnType<typeof createAccountService>;
  drafts: ReturnType<typeof createDraftService>;
  origin: string;
}
async function readInput(request: Request) {
  if (
    !request.headers.get("Content-Type")?.startsWith("application/json") ||
    !request.body
  )
    throw new DraftError(400, "JSON required.");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 300000) throw new DraftError(413, "Recipe is too large.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new DraftError(400, "Invalid request.");
  }
}
export async function handleDraftRequest(
  request: Request,
  id?: string,
  dependencies?: Dependencies,
) {
  try {
    if (request.method !== "GET")
      assertSameOriginWrite(
        request,
        dependencies?.origin ??
          accountConfiguration()?.origin ??
          new URL(request.url).origin,
      );
    const actor = await (dependencies?.accounts ?? accounts()).requireActor(
      request,
    );
    const svc = dependencies?.drafts ?? draftsService();
    if (request.method === "GET") {
      const url = new URL(request.url);
      if (url.searchParams.has("similar"))
        return Response.json(
          {
            ok: true,
            value: await svc.similarTitles(
              url.searchParams.get("similar") ?? "",
            ),
          },
          { headers },
        );
      const output = id
        ? await svc.readDraft(actor, id)
        : await svc.listDrafts(actor);
      return Response.json(output, {
        status: output.ok ? 200 : output.error.status,
        headers,
      });
    }
    const input = await readInput(request);
    const action = id ? (input.action ?? "save") : "create";
    const allowed =
      action === "create"
        ? []
        : action === "save"
          ? ["action", "version", "input"]
          : action === "copy"
            ? ["action", "generation", "input"]
            : ["action", "version"];
    if (Object.keys(input).some((k) => !allowed.includes(k)))
      throw new DraftError(400, "Unknown request field.");
    if (request.method !== "POST" && request.method !== "DELETE")
      throw new DraftError(405, "Method not allowed.");
    const output =
      action === "create"
        ? await svc.createDraft(actor)
        : action === "save"
          ? await svc.saveDraft(actor, id!, Number(input.version), input.input)
          : action === "publish"
            ? await svc.publishRecipe(actor, id!, Number(input.version))
            : action === "copy"
              ? await svc.copyDraft(
                  actor,
                  id!,
                  Number(input.generation),
                  input.input,
                )
              : action === "delete"
                ? await svc.deleteDraft(actor, id!, Number(input.version))
                : null;
    if (!output) throw new DraftError(400, "Invalid action.");
    return Response.json(output, {
      status: output.ok ? 200 : output.error.status,
      headers: {
        ...headers,
        ...(!output.ok && output.error.retryAfter
          ? { "Retry-After": String(output.error.retryAfter) }
          : {}),
      },
    });
  } catch (e) {
    if (e instanceof ClerkResponseError) return e.response;
    const status =
      e instanceof DraftError || e instanceof AccountError ? e.status : 503;
    return Response.json(
      {
        ok: false,
        error: {
          status,
          message:
            status === 401
              ? "Sign-in required."
              : status === 403
                ? "Access denied."
                : status === 400
                  ? "Invalid request."
                  : status === 413
                    ? "Recipe is too large."
                    : "Draft service unavailable. Please retry.",
        },
      },
      { status, headers },
    );
  }
}
