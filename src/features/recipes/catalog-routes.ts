import { accounts, type Actor } from "../accounts/service";
import { AccountError, assertSameOriginWrite, signInHref } from "../accounts/permissions";
import { ClerkResponseError, accountConfiguration } from "../../server/clerk";
import { catalogService, type CatalogScope, type createCatalogService } from "./catalog";
import { parseDiscoverParams } from "./discover-state";
import { favoriteService, type createFavoriteService } from "./favorites";
import { isId } from "./validation";

// Public lists stay uncached until moderation can invalidate shared caches.
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const failure = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, error: { status, message, ...extra } }, { status, headers });

/** Signed-in actor, or null for guests and when sign-in is not configured. */
export async function optionalActor(request: Request): Promise<Actor | null> {
  try {
    return await accounts().requireActor(request);
  } catch (e) {
    if (e instanceof AccountError || e instanceof ClerkResponseError) return null;
    throw e;
  }
}

interface CatalogDependencies {
  catalog: ReturnType<typeof createCatalogService>;
  viewer: (request: Request) => Promise<Actor | null>;
}

export async function handleCatalogRequest(request: Request, dependencies?: CatalogDependencies) {
  try {
    const url = new URL(request.url);
    const viewer = await (dependencies?.viewer ?? optionalActor)(request);
    const search = url.searchParams;
    const kind = search.get("scope");
    let scope: CatalogScope | undefined;
    if (kind === "favorites") {
      if (!viewer) return failure(401, "Sign in to see your favorites.");
      scope = { kind: "favorites", memberId: viewer.id };
    } else if (kind === "saved" || kind === "author") {
      const member = search.get("member");
      if (!isId(member)) return failure(400, "Invalid request.");
      scope = kind === "saved" ? { kind, memberId: member, viewerId: viewer?.id ?? null } : { kind, memberId: member };
    } else if (kind !== null) return failure(400, "Invalid request.");
    const cursor = search.get("cursor") ?? undefined;
    const output = await (dependencies?.catalog ?? catalogService()).list(
      { ...parseDiscoverParams(search), cursor, scope, language: search.get("lang") === "es" ? "es" : "en" },
      viewer?.id ?? null,
    );
    return Response.json(output, { status: output.ok ? 200 : output.error.status, headers });
  } catch {
    return failure(503, "Recipes are unavailable right now. Please retry.");
  }
}

interface FavoriteDependencies {
  favorites: ReturnType<typeof createFavoriteService>;
  viewer: (request: Request) => Promise<Actor | null>;
  origin: string;
}

export async function handleFavoriteRequest(request: Request, id: string, dependencies?: FavoriteDependencies) {
  const origin = dependencies?.origin ?? accountConfiguration()?.origin ?? new URL(request.url).origin;
  try {
    if (request.method !== "PUT" && request.method !== "DELETE") return failure(405, "Method not allowed.");
    assertSameOriginWrite(request, origin);
    const actor = await (dependencies?.viewer ?? optionalActor)(request);
    const svc = dependencies?.favorites ?? favoriteService();
    const output = request.method === "PUT" ? await svc.add(actor, id) : await svc.remove(actor, id);
    if (!output.ok && output.error.status === 401)
      return failure(401, output.error.message, { signIn: signInHref(`/?save=${isId(id) ? id : ""}`, origin) });
    return Response.json(output, { status: output.ok ? 200 : output.error.status, headers });
  } catch (e) {
    if (e instanceof AccountError) return failure(e.status, "Access denied.");
    return failure(503, "Saving is unavailable. Please retry.");
  }
}
