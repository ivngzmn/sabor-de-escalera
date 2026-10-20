import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../../src/server/db";
import { fixtureDependencies } from "../fixtures/dependencies";

test("actual Astro editor saves, preserves language/steps, focuses errors, confirms paste, resolves conflicts and publishes escaped text", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Editor browser test needs local PostgreSQL");
  const schema = `editor_${randomUUID().replaceAll("-", "")}`;
  const db = new Pool({ connectionString: url });
  await db.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({
    connectionString: url,
    options: `-c search_path=${schema}`,
  });
  await migrate(pool);
  await pool.query(
    "INSERT INTO members(auth_provider,auth_subject,verified_email,display_name,onboarded_at) VALUES('clerk','fixture-author','author@example.com','Author',now())",
  );
  const root = await mkdtemp(join(tmpdir(), "escalera-editor-"));
  await cp("src", join(root, "src"), { recursive: true });
  await cp("package.json", join(root, "package.json"));
  await cp("tsconfig.json", join(root, "tsconfig.json"));
  await fixtureDependencies(root, ["@astrojs/react"]);
  // Only the external Clerk SDK transport is replaced. Actual middleware, account
  // mapping, routes, PostgreSQL, React hydration and editor assets run unchanged.
  const clerk = await readFile(join(root, "src/server/clerk.ts"), "utf8");
  await writeFile(
    join(root, "src/server/clerk.ts"),
    clerk.replace("from '@clerk/astro/server'", "from './fixture-clerk'"),
  );
  await writeFile(
    join(root, "src/server/fixture-clerk.ts"),
    `import {readFile} from 'node:fs/promises';export function createClerkClient(){return {authenticateRequest:async()=>({status:'signed-in',headers:new Headers(),isAuthenticated:await readFile('auth-state','utf8').then(s=>s!=='out').catch(()=>true),toAuth:()=>({userId:'fixture-author'})}),users:{getUser:async()=>({id:'fixture-author',primaryEmailAddressId:'mail',emailAddresses:[{id:'mail',emailAddress:'author@example.com',verification:{status:'verified'}}]})}}}`,
  );
  await writeFile(
    join(root, "astro.config.mjs"),
    `import {defineConfig} from 'astro/config';import react from '@astrojs/react';import tailwindcss from '@tailwindcss/vite';export default defineConfig({output:'server',integrations:[react()],vite:{plugins:[tailwindcss()]},devToolbar:{enabled:false}});`,
  );
  const connection = new URL(url);
  connection.searchParams.set("options", `-c search_path=${schema}`);
  const port = "4347",
    base = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [
      resolve("node_modules/astro/bin/astro.mjs"),
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      port,
      "--ignore-lock",
    ],
    {
      cwd: root,
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: connection.toString(),
        PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Zml4dHVyZS5leGFtcGxlJA==",
        CLERK_SECRET_KEY: "fixture-only",
        APP_ORIGIN: base,
        CLERK_EMAIL_CODE_CONFIGURED: "true",
      },
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", async (d) => {
    if (d.type() !== "beforeunload") errors.push("Unexpected author dialog");
    await d.accept();
  });
  try {
    await expect
      .poll(
        () =>
          fetch(`${base}/@vite/client`)
            .then((r) => r.ok)
            .catch(() => false),
        { timeout: 25000 },
      )
      .toBe(true);
    // Exercise the actual Astro profile route and native POST without hydration.
    const profileContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    try {
      const profilePage = await profileContext.newPage();
      await profilePage.goto(`${base}/onboarding?lang=es`);
      await expect(
        profilePage.getByLabel("Nombre público (obligatorio)"),
      ).toHaveValue("Author");
      await profilePage
        .getByLabel("Nombre público (obligatorio)")
        .fill("Ana <Escalera>");
      await profilePage
        .getByLabel("Biografía (opcional)")
        .fill("Recetas de familia");
      await profilePage
        .getByLabel("Avatar", { exact: true })
        .selectOption("corn");
      await profilePage
        .getByLabel("Visibilidad de recetas guardadas")
        .selectOption("false");
      await profilePage
        .getByRole("button", { name: "Guardar y continuar" })
        .click();
      await expect(profilePage).toHaveURL(`${base}/`);
      await profilePage.goto(`${base}/onboarding?lang=es`);
      await expect(
        profilePage.getByLabel("Nombre público (obligatorio)"),
      ).toHaveValue("Ana <Escalera>");
      await expect(profilePage.getByLabel("Biografía (opcional)")).toHaveValue(
        "Recetas de familia",
      );
      await expect(
        profilePage.getByLabel("Avatar", { exact: true }),
      ).toHaveValue("corn");
      await expect(
        profilePage.getByLabel("Visibilidad de recetas guardadas"),
      ).toHaveValue("false");
    } finally {
      await profileContext.close();
    }

    // Before hydration the editor shows its placeholder; it must honour reduced motion.
    const staticContext = await browser.newContext({
      javaScriptEnabled: false,
      reducedMotion: "reduce",
    });
    try {
      const staticPage = await staticContext.newPage();
      await staticPage.goto(`${base}/add-recipe`);
      const loading = staticPage.getByRole("status", {
        name: "Loading recipe",
      });
      await expect(loading).toBeVisible();
      await expect(loading).toHaveAttribute("aria-busy", "true");
      for (const shape of await loading
        .locator('[data-slot="skeleton"]')
        .all()) {
        await expect(shape).toHaveCSS("animation-name", "none");
      }
    } finally {
      await staticContext.close();
    }

    // Opening the editor creates nothing; the draft is created once the member
    // continues with something filled in, exactly once.
    let creationPosts = 0;
    let releaseCreation!: () => void;
    const creationGate = new Promise<void>((resolve) => {
      releaseCreation = resolve;
    });
    await page.route(`${base}/api/drafts`, async (route) => {
      if (route.request().method() === "POST") {
        creationPosts += 1;
        await creationGate;
      }
      await route.continue();
    });
    const recipeCount = async () =>
      (await pool.query("SELECT count(*)::int AS n FROM recipes")).rows[0].n;
    await page.goto(`${base}/add-recipe`);
    const title = page.getByLabel("Title", { exact: true });
    await expect(title).toBeEnabled({ timeout: 15000 });
    expect(errors, "editor hydration must succeed").toEqual([]);
    await expect(
      page.getByText("Not saved yet — your draft is saved when you continue.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save Draft", exact: true }),
    ).toBeDisabled();
    await page.waitForTimeout(3000);
    expect(creationPosts).toBe(0);
    expect(await recipeCount()).toBe(0);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Photos", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(1000);
    expect(creationPosts).toBe(0);
    expect(await recipeCount()).toBe(0);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await title.fill("Abuela's tamales");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    // Creation is still held: the form stays usable and keeps the newer text.
    await expect(title).toBeEnabled();
    await expect.poll(() => creationPosts).toBe(1);
    await title.fill("Abuela's tamales verdes");
    releaseCreation();
    await expect.poll(recipeCount, { timeout: 15000 }).toBe(1);
    await expect(title).toHaveValue("Abuela's tamales verdes");
    await expect
      .poll(
        async () =>
          (await pool.query("SELECT input->>'title' AS title FROM recipes"))
            .rows[0].title,
        { timeout: 15000 },
      )
      .toBe("Abuela's tamales verdes");
    expect(creationPosts).toBe(1);
    expect(await recipeCount()).toBe(1);
    await page.unroute(`${base}/api/drafts`);
    const initialDraft = (await pool.query("SELECT id FROM recipes")).rows[0]
      .id;
    await expect(page).toHaveURL(new RegExp(`draft=${initialDraft}`));
    await page.evaluate(() => {
      localStorage.setItem(
        "escalera:consent",
        JSON.stringify({
          version: 1,
          preferences: true,
          recovery: false,
          analytics: false,
          updatedAt: new Date().toISOString(),
        }),
      );
      localStorage.setItem("escalera:preferences:language", "es");
    });
    await page.goto(`${base}/add-recipe?draft=${initialDraft}`);
    await expect(
      page.getByRole("button", { name: "Guardar borrador", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "English", exact: true }).click();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("escalera:preferences:language"),
      ),
    ).toBe("en");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const back = page.getByRole("button", { name: "Back", exact: true });
    await page.mouse.move(0, 0);
    await expect(back).toHaveCSS("background-color", "rgb(255, 255, 255)");
    expect(
      await back.evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await back.focus();
    await expect(back).toBeFocused();
    await back.click();
    await page
      .getByLabel("Title", { exact: true })
      .fill("<img src=x onerror=alert(1)> Frijoles");
    await page
      .getByRole("button", { name: "Ingredients", exact: true })
      .click();
    await page.getByRole("link", { name: "Español", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Ingredientes", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "English", exact: true }).click();
    await page
      .getByLabel("Paste ingredient lines")
      .fill("½ cup beans\nSalt to taste");
    await page.getByRole("button", { name: "Review pasted lines" }).click();
    expect(
      (await pool.query("SELECT input FROM recipes")).rows[0].input.ingredients,
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Confirm lines as written" })
      .click();
    await expect(page.getByLabel("Ingredient name 1")).toHaveValue(
      "½ cup beans",
    );
    await page.getByRole("button", { name: "Move ingredient 2 up" }).click();
    await expect(page.getByLabel("Ingredient name 1")).toHaveValue(
      "Salt to taste",
    );
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page
      .getByRole("button", { name: "Publish Recipe", exact: true })
      .click();
    await page.getByRole("button", { name: "Choose a category." }).click();
    await expect(page.getByLabel("Primary category")).toBeFocused();
    await expect(page.getByLabel("Primary category")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByLabel("Primary category")).toHaveAttribute(
      "aria-describedby",
      "field-category-error",
    );
    await expect(
      page.getByLabel("Primary category").locator(".."),
    ).toHaveAttribute("data-invalid", "true");

    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "<img src=x onerror=alert(1)> Frijoles",
    );
    await page.getByLabel("Primary category").click();
    await page.getByRole("option", { name: /^Main/ }).click();
    await page.getByLabel("Origin", { exact: true }).click();
    await page.getByRole("option", { name: /not sure/i }).click();
    await page.getByLabel("Servings / yield").fill("4–6 servings");
    await page.getByLabel("Scaling baseline").fill("4");
    await page.getByLabel("I confirm this numeric baseline").check();
    await page.getByLabel("Total minutes").fill("30");
    await page
      .getByRole("button", { name: "Instructions", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add instruction", exact: true })
      .click();
    await page
      .getByLabel("Instruction 1", { exact: true })
      .fill("Cook carefully.");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /Saved/ }),
    ).toBeVisible();
    const row = (await pool.query("SELECT * FROM recipes")).rows[0];
    await pool.query(
      "UPDATE recipes SET input=jsonb_set(input,'{title}','\"Changed on another device\"'),version=version+1,last_saved_at=now()-interval '6 seconds' WHERE id=$1",
      [row.id],
    );
    await page
      .getByLabel("Instruction 1", { exact: true })
      .fill("My preserved instruction.");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Save as separate draft" }),
    ).toBeVisible({ timeout: 10000 });
    await page.route("**/api/drafts/*", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON().action === "copy"
      )
        await route.abort("connectionfailed");
      else await route.continue();
    });
    await page.getByRole("button", { name: "Save as separate draft" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Could not create a separate draft",
    );
    await expect(page.getByLabel("Instruction 1", { exact: true })).toHaveValue(
      "My preserved instruction.",
    );
    await page.unroute("**/api/drafts/*");
    let releaseCopy!: () => void;
    const copyGate = new Promise<void>((resolve) => {
      releaseCopy = resolve;
    });
    await page.route("**/api/drafts/*", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON().action === "copy"
      ) {
        const response = await route.fetch();
        await copyGate;
        await route.fulfill({ response });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Save as separate draft" }).click();
    await expect
      .poll(
        async () =>
          (await pool.query("SELECT count(*)::int AS n FROM recipes")).rows[0]
            .n,
      )
      .toBe(2);
    await page
      .getByLabel("Instruction 1", { exact: true })
      .fill("Typed while the separate copy was pending.");
    releaseCopy();
    await expect(
      page.getByRole("button", { name: "Save as separate draft" }),
    ).toBeHidden();
    await expect(page.getByLabel("Instruction 1", { exact: true })).toHaveValue(
      "Typed while the separate copy was pending.",
    );
    await page.unroute("**/api/drafts/*");
    const current = (
      await pool.query("SELECT * FROM recipes ORDER BY created_at DESC LIMIT 1")
    ).rows[0];
    const intent = randomUUID(),
      asset = randomUUID();
    await pool.query(
      "INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,expires_at,completed_at) VALUES($1,$2,'recipe','image/jpeg',1,$3,now(),now())",
      [intent, current.owner_id, `/${intent}`],
    );
    await pool.query(
      "INSERT INTO media_assets(id,intent_id,owner_id,purpose,provider_file_id,provider_path,stored_bytes,width,height) VALUES($1,$2,$3,'recipe',$4,$4,100,640,480)",
      [asset, intent, current.owner_id, `/${intent}`],
    );
    const input = {
      ...current.input,
      photos: [
        {
          assetId: asset,
          caption: "Author provided recipe photo",
          alt: "",
          crop: { x: 30, y: 60, zoom: 1.5 },
        },
      ],
    };
    await pool.query(
      "UPDATE recipes SET input=$2,version=version+1 WHERE id=$1",
      [current.id, JSON.stringify(input)],
    );
    await pool.query(
      "INSERT INTO media_references(asset_id,kind,reference_id) VALUES($1,'recipe',$2)",
      [asset, current.id],
    );
    await page.goto(`${base}/add-recipe?draft=${current.id}`);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator("main img")).toHaveCount(1);
    await expect(page.locator(".recipe-preview script")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole("button", { name: "Instructions", exact: true })
      .click();
    await page
      .getByLabel("Instruction 1", { exact: true })
      .fill("Saved instruction before publish.");
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible({ timeout: 10000 });
    await page
      .getByLabel("Instruction 1", { exact: true })
      .fill("Final instruction for publication.");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    let loseCommittedPublication = false;
    await page.route("**/api/drafts/*", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON().action === "publish"
      ) {
        if (loseCommittedPublication) await route.fetch();
        await route.abort("connectionfailed");
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Publish Recipe", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Could not confirm publication",
      { timeout: 15000 },
    );
    expect(
      (await pool.query("SELECT state FROM recipes WHERE id=$1", [current.id]))
        .rows[0].state,
    ).toBe("draft");
    loseCommittedPublication = true;
    await page
      .getByRole("button", { name: "Publish Recipe", exact: true })
      .click();
    await expect(page.getByRole("link", { name: "View Recipe" })).toBeVisible({
      timeout: 10000,
    });
    await page.unroute("**/api/drafts/*");
    await page.getByRole("link", { name: "View Recipe" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Frijoles",
    );
    await expect(
      page.getByText("Final instruction for publication.", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM recipe_publications WHERE recipe_id=$1",
          [current.id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(errors).toEqual([]);
    await page.goto(`${base}/privacy`);
    await page.getByRole("button", { name: "Accept optional" }).click();
    // A fresh draft exists only after the member continues with content.
    const startDraft = async (name: string) => {
      await page.goto(`${base}/add-recipe`);
      await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
      await page.getByLabel("Title", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page).toHaveURL(/[?&]draft=/, { timeout: 10000 });
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
    };
    await startDraft("Draft to delete");
    await page.route("**/api/drafts/*", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON().action === "delete"
      )
        await route.abort("connectionfailed");
      else await route.continue();
    });
    const deleteId = new URL(page.url()).searchParams.get("draft");
    const rowState = async () =>
      (await pool.query("SELECT state FROM recipes WHERE id=$1", [deleteId]))
        .rows[0].state;
    const openDelete = async () => {
      await page
        .getByRole("button", { name: "Delete draft", exact: true })
        .click();
      return page.getByRole("alertdialog", { name: "Delete draft" });
    };
    let dialog = await openDelete();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("This permanently removes the draft");
    await expect(
      dialog.getByRole("button", { name: "Keep draft" }),
    ).toBeFocused();
    expect(
      (await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze())
        .violations,
    ).toEqual([]);
    await dialog
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Could not confirm deletion",
    );
    await dialog
      .getByRole("button", { name: "Keep draft", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    expect(await rowState()).toBe("draft");
    await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
    await page.unroute("**/api/drafts/*");
    await page.route("**/api/drafts/*", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON().action === "delete"
      )
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              status: 409,
              message:
                "A newer version exists. Load latest or save your work as a separate draft.",
            },
          }),
        });
      else await route.continue();
    });
    dialog = await openDelete();
    await dialog
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Load latest" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save as separate draft" }),
    ).toBeVisible();
    expect(await rowState()).toBe("draft");
    await page.unroute("**/api/drafts/*");
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
    dialog = await openDelete();
    await dialog
      .getByRole("button", { name: "Delete permanently", exact: true })
      .click();
    await expect.poll(rowState).toBe("deleted");
    await expect(dialog).toBeHidden();
    await startDraft("Recovery draft");
    await page.context().setOffline(true);
    await page
      .getByLabel("Title", { exact: true })
      .fill("Device recovery example");
    await expect(page.getByText("Not saved", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    expect(
      await page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) =>
            k.startsWith("escalera:recovery:"),
          ).length,
      ),
    ).toBe(1);
    await page.context().setOffline(false);
    await page.reload();
    await page.getByRole("button", { name: "Restore device copy" }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Device recovery example",
    );
    await page.getByRole("button", { name: "Save Draft", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: /Saved/ }),
    ).toBeVisible({ timeout: 10000 });
    await page.context().setOffline(true);
    await page
      .getByLabel("Title", { exact: true })
      .fill("Stale reset device copy");
    const resetId = new URL(page.url()).searchParams.get("draft");
    await pool.query(
      "INSERT INTO draft_tombstones(draft_id,owner_id) SELECT id,owner_id FROM recipes WHERE id=$1",
      [resetId],
    );
    await pool.query("UPDATE recipes SET state='deleted' WHERE id=$1", [
      resetId,
    ]);
    await page.context().setOffline(false);
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Object.keys(localStorage).filter((k) =>
              k.startsWith("escalera:recovery:"),
            ).length,
        ),
      )
      .toBe(0);
    const restart = page.getByRole("link", {
      name: "Start a new recipe",
      exact: true,
    });
    await expect(restart).toBeVisible();
    await expect(restart).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(restart).toHaveCSS("background-color", "rgb(200, 75, 49)");
    // Leaving through an in-site link asks to save or discard unsaved work.
    const discover = page.getByRole("link", { name: "Discover", exact: true });
    const leaveDialog = page.getByRole("dialog", {
      name: "Save your recipe before leaving?",
    });
    const titleOf = async (id: string | null) =>
      (
        await pool.query(
          "SELECT input->>'title' AS title, state FROM recipes WHERE id=$1",
          [id],
        )
      ).rows[0];
    // A saved, unchanged draft leaves without asking.
    await startDraft("Leave unchanged");
    await expect(
      page.getByRole("status").filter({ hasText: /^Saved$/ }),
    ).toBeVisible({ timeout: 10000 });
    await discover.click();
    await expect(page).toHaveURL(`${base}/`);
    await expect(leaveDialog).toHaveCount(0);
    // Typed but not yet saved: the dialog asks; Keep editing stays put.
    await page.goto(`${base}/add-recipe`);
    await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
    await page
      .getByLabel("Title", { exact: true })
      .fill("Saved on the way out");
    const editorUrl = page.url();
    await discover.click();
    await expect(leaveDialog).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeFocused();
    await expect(leaveDialog).toContainText(
      "You've started “Saved on the way out”. Save it as a draft to finish later, or discard it.",
    );
    expect(
      (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
        .violations,
    ).toEqual([]);
    await leaveDialog
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await expect(leaveDialog).toBeHidden();
    expect(page.url()).toBe(editorUrl);
    // Save draft creates the draft, then continues to the link.
    await discover.click();
    await leaveDialog
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await expect(page).toHaveURL(`${base}/`, { timeout: 15000 });
    expect(
      (
        await pool.query(
          "SELECT input->>'title' AS title FROM recipes ORDER BY created_at DESC LIMIT 1",
        )
      ).rows[0].title,
    ).toBe("Saved on the way out");
    // Hold autosave back so the typed change is still unsaved when leaving.
    await page.route("**/api/drafts/*", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().postDataJSON().action === "save"
      )
        await route.abort("connectionfailed");
      else await route.continue();
    });
    // Discarding a draft created in this visit deletes it.
    await startDraft("Discard what I started");
    const startedId = new URL(page.url()).searchParams.get("draft");
    await page
      .getByLabel("Title", { exact: true })
      .fill("Discard what I started, more");
    await discover.click();
    await leaveDialog
      .getByRole("button", { name: "Discard", exact: true })
      .click();
    await expect(page).toHaveURL(`${base}/`, { timeout: 15000 });
    expect((await titleOf(startedId)).state).toBe("deleted");
    // Discarding changes to a re-opened draft keeps the draft as it was saved.
    const reopenedId = (
      await pool.query(
        "SELECT id FROM recipes WHERE state='draft' AND input->>'title'=$1",
        ["Saved on the way out"],
      )
    ).rows[0].id;
    await page.goto(`${base}/add-recipe?draft=${reopenedId}`);
    await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
    await page.getByLabel("Title", { exact: true }).fill("Changes to discard");
    await discover.click();
    await leaveDialog
      .getByRole("button", { name: "Discard", exact: true })
      .click();
    await expect(page).toHaveURL(`${base}/`, { timeout: 15000 });
    expect(await titleOf(reopenedId)).toEqual({
      title: "Saved on the way out",
      state: "draft",
    });
    expect(
      await page.evaluate(
        (id) =>
          Object.keys(localStorage).filter(
            (k) => k.startsWith("escalera:recovery:") && k.includes(id),
          ).length,
        reopenedId,
      ),
    ).toBe(0);
    await page.unroute("**/api/drafts/*");
    // A failed save stays in the editor and shows the failure.
    await page.goto(`${base}/add-recipe?draft=${reopenedId}`);
    await expect(page.getByLabel("Title", { exact: true })).toBeEnabled();
    await page.route("**/api/drafts/*", async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({ status: 503, body: "unavailable" });
      else await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Server is down");
    const reopenedUrl = page.url();
    await discover.click();
    await leaveDialog
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await expect(leaveDialog).toBeHidden({ timeout: 15000 });
    await expect(
      page.getByRole("alert").filter({ hasText: "Your draft needs attention" }),
    ).toBeVisible();
    expect(page.url()).toBe(reopenedUrl);
    // A modifier click opens a new tab and leaves this one alone.
    const opened = page.context().waitForEvent("page");
    await discover.click({ modifiers: ["ControlOrMeta"] });
    await (await opened).close();
    await expect(leaveDialog).toHaveCount(0);
    expect(page.url()).toBe(reopenedUrl);
    await page.unroute("**/api/drafts/*");
    await startDraft("Logout draft");
    await page.context().setOffline(true);
    await page
      .getByLabel("Title", { exact: true })
      .fill("Logout clears this account");
    await page.evaluate(() => localStorage.setItem("unrelated:keep", "yes"));
    await writeFile(join(root, "auth-state"), "out");
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByLabel("Title", { exact: true })).toBeDisabled();
    expect(
      await page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) =>
            k.startsWith("escalera:recovery:"),
          ).length,
      ),
    ).toBe(0);
    expect(
      await page.evaluate(() => localStorage.getItem("unrelated:keep")),
    ).toBe("yes");
  } catch (e) {
    console.error(output);
    throw e;
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((done) => {
      if (child.exitCode !== null) done();
      else child.once("exit", () => done());
    });
    await rm(root, { recursive: true, force: true });
    await pool.end();
    await db.query(`DROP SCHEMA ${schema} CASCADE`);
    await db.end();
  }
});
