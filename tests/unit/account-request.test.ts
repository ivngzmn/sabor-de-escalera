import { expect, test } from "vitest";
import { handleAccountRequest } from "../../src/server/account-request";

const adapter = { handleRequest: (_request: Request, next: () => Promise<Response>) => next() } as never;
const run = async (method: string, path: string, status = 200) => {
  const response = await handleAccountRequest(
    new Request(`https://recipes.example${path}`, { method }),
    async () => new Response(null, { status, headers: { "Cache-Control": "private, no-cache" } }),
    adapter,
  );
  return response.headers.get("Cache-Control");
};

test("a photo read keeps its own private cache header", async () => {
  expect(await run("GET", "/api/media/11111111-1111-4111-8111-111111111111")).toBe("private, no-cache");
  expect(await run("GET", "/api/media/11111111-1111-4111-8111-111111111111", 304)).toBe("private, no-cache");
});

test("everything else on account routes stays no-store", async () => {
  expect(await run("GET", "/api/media/11111111-1111-4111-8111-111111111111", 404)).toBe("private, no-store");
  expect(await run("POST", "/api/media/intents")).toBe("private, no-store");
  expect(await run("GET", "/api/accounts/me")).toBe("private, no-store");
  expect(await run("GET", "/profile")).toBe("private, no-store");
});

test("the Clerk layer keeps a revalidated photo header and adds no-store to everything else", async () => {
  const { createClerkAdapter } = await import("../../src/server/clerk");
  const provider = { authenticateRequest: async () => ({ status: "signed-in", headers: new Headers(), isAuthenticated: true }), getUser: async () => null } as never;
  const clerk = createClerkAdapter(provider);
  const request = () => new Request("https://recipes.example/api/media/11111111-1111-4111-8111-111111111111");
  const kept = await clerk.handleRequest(request(), async () => new Response(null, { headers: { "Cache-Control": "private, no-cache" } }));
  expect(kept.headers.get("Cache-Control")).toBe("private, no-cache");
  const plain = await clerk.handleRequest(request(), async () => new Response(null));
  expect(plain.headers.get("Cache-Control")).toBe("private, no-store");
  const shared = await clerk.handleRequest(request(), async () => new Response(null, { headers: { "Cache-Control": "public, max-age=3600" } }));
  expect(shared.headers.get("Cache-Control")).toBe("private, no-store");
});
