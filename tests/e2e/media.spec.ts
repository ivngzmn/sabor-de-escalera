import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fixtureDependencies } from "../fixtures/dependencies";

test("real Astro React island hydrates, validates, preserves the photo and retries completion without reuploading", async ({
  page,
}) => {
  test.setTimeout(60000);
  // This isolated Astro harness supplies a ready UI and provider responses.
  // Production has no test login, test route or identity bypass.
  const root = await mkdtemp(join(tmpdir(), "escalera-media-island-"));
  await mkdir(join(root, "src/pages"), { recursive: true });
  await mkdir(join(root, "src/features/media"), { recursive: true });
  for (const file of ["ImageUploader.tsx", "contracts.ts"])
    await cp(
      `src/features/media/${file}`,
      join(root, "src/features/media", file),
    );
  await fixtureDependencies(root, ["@astrojs/react"]);
  await cp("package.json", join(root, "package.json"));
  await cp("tsconfig.json", join(root, "tsconfig.json"));
  for (const folder of ["components", "lib", "styles"])
    await cp(`src/${folder}`, join(root, `src/${folder}`), { recursive: true });
  await writeFile(
    join(root, "astro.config.mjs"),
    `import { defineConfig } from 'astro/config'; import react from '@astrojs/react'; import tailwindcss from '@tailwindcss/vite'; export default defineConfig({ integrations: [react()], vite:{plugins:[tailwindcss()]}, devToolbar: { enabled: false } });`,
  );
  await writeFile(
    join(root, "src/pages/index.astro"),
    `---\nimport '../styles/global.css';import '../styles/tokens.css';import ImageUploader from '../features/media/ImageUploader';\n---\n<html lang="en"><head><title>Media interaction fixture</title></head><body><main><h1>Profile photo</h1><ImageUploader client:load purpose="avatar" available={true} /></main></body></html>`,
  );
  const child = spawn(
    process.execPath,
    [
      resolve("node_modules/astro/bin/astro.mjs"),
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      "4333",
      "--ignore-lock",
    ],
    { cwd: root, stdio: "pipe", env: { ...process.env, NODE_ENV: "test" } },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let uploads = 0;
  let completions = 0;
  try {
    await expect
      .poll(
        async () => {
          if (child.exitCode !== null) throw new Error(output);
          return fetch("http://127.0.0.1:4333/@vite/client")
            .then((res) => res.ok)
            .catch(() => false);
        },
        { timeout: 20000 },
      )
      .toBe(true);
    await page.route("**/api/media/intents", (route) =>
      route.fulfill({
        json: {
          ok: true,
          value: {
            id: "fixture-intent",
            expiresAt: Date.now() + 300000,
            grant: {
              endpoint: "https://upload.imagekit.io/api/v2/files/upload",
              fields: { isPrivateFile: true },
              token: "fixture",
            },
          },
        },
      }),
    );
    await page.route(
      "https://upload.imagekit.io/api/v2/files/upload",
      (route) => {
        uploads++;
        return route.fulfill({
          status: 200,
          json: { fileId: "ignored-client-result" },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      },
    );
    await page.route("**/api/media/complete", (route) => {
      completions++;
      return route.fulfill(
        completions === 3
          ? {
              status: 409,
              json: {
                ok: false,
                error: { message: "Upload expired. Retry your photo." },
              },
            }
          : completions === 1
            ? {
                status: 503,
                json: { ok: false, error: { message: "Try again." } },
              }
            : {
                json: {
                  ok: true,
                  value: { id: "fixture-asset", width: 640, height: 480 },
                },
              },
      );
    });
    await page.route("**/api/media/avatar", (route) =>
      route.fulfill({
        json: {
          ok: true,
          value: { id: "fixture-asset", width: 640, height: 480 },
        },
      }),
    );
    await page.route("**/api/media/fixture-asset?variant=avatar", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.goto("http://127.0.0.1:4333", { timeout: 15000 });
    await expect(page.locator("astro-island")).not.toHaveAttribute("ssr", "");
    await page
      .getByLabel("Choose photo")
      .setInputFiles({
        name: "unsafe.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from("<svg/>"),
      });
    await expect(page.getByRole("alert")).toContainText("JPEG, PNG or WebP");
    await page
      .getByLabel("Choose photo")
      .setInputFiles({
        name: "photo.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from([255, 216, 255, 217]),
      });
    await page
      .getByRole("button", { name: "Upload photo", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Try again");
    await page.getByRole("button", { name: "Retry photo" }).click();
    await expect(page.getByRole("status")).toContainText("Photo saved");
    expect(uploads).toBe(1);
    expect(completions).toBe(2);
    expect(errors).toEqual([]);
    await page
      .getByLabel("Choose photo")
      .setInputFiles({
        name: "fresh.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from([255, 216, 255, 217]),
      });
    await page
      .getByRole("button", { name: "Upload photo", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("expired");
    await page.getByRole("button", { name: "Retry photo" }).click();
    await expect(page.getByRole("status")).toContainText("Photo saved");
    expect(uploads).toBe(3);
    await page.route("**/api/media/intents", (route) =>
      route.fulfill({
        status: 429,
        json: {
          ok: false,
          error: { message: "Upload limit reached.", retryAfter: 120 },
        },
      }),
    );
    await page
      .getByLabel("Choose photo")
      .setInputFiles({
        name: "quota.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from([255, 216, 255, 217]),
      });
    await page
      .getByRole("button", { name: "Upload photo", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("2 minutes");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  } catch (error) {
    console.error(output);
    throw error;
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((done) => {
      if (child.exitCode !== null) done();
      else child.once("exit", () => done());
    });
    await rm(root, { recursive: true, force: true });
  }
});

test("unconfigured production media routes fail closed with private caching", async ({
  request,
  baseURL,
}) => {
  for (const path of [
    "/api/media/intents",
    "/api/media/complete",
    "/api/media/avatar",
  ]) {
    const response = await request.post(path, {
      headers: { Origin: baseURL! },
      data: {},
    });
    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
  for (const path of [
    "/api/media/00000000-0000-0000-0000-000000000000",
    "/api/media/00000000-0000-0000-0000-000000000000?variant=original",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
});
