import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

// The Vercel function is bundled from the adapter's runtime entry. In @astrojs/vercel 11.0.13 that
// entry imported its constants from the adapter's build-time index, which imports Rolldown. Rolldown
// loads a native binary on import, so it was bundled into the function without its binary and every
// request failed with "Cannot find native binding" (500 FUNCTION_INVOCATION_FAILED).
test("the Vercel function entry does not pull build tooling into the server bundle", () => {
  const adapter = dirname(createRequire(import.meta.url).resolve("@astrojs/vercel/package.json"));
  const entry = readFileSync(join(adapter, "dist/serverless/entrypoint.js"), "utf8");
  const imports = [...entry.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);
  expect(imports).not.toContain("../index.js");
  expect(imports).not.toContain("rolldown");
});
