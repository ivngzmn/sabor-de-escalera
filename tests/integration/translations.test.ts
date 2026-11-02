import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { migrate } from "../../src/server/db";
import { createAccountService, type Actor } from "../../src/features/accounts/service";
import { publishedRecipe } from "./catalog-fixtures";

const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Requires local PostgreSQL");
const schema = `translations_${randomUUID().replaceAll("-", "")}`;
const root = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
let admin: Actor;
let member: Actor;

beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query("TRUNCATE members CASCADE");
  const accounts = createAccountService({ pool, origin: "https://recipes.example", verifyIdentity: async () => null });
  const ensure = (subject: string) =>
    accounts.ensureMember({ provider: "clerk", subject, email: `${subject}@example.com`, emailVerified: true });
  admin = await ensure("admin");
  member = await ensure("member");
  await pool.query("UPDATE members SET onboarded_at=now(), display_name='Cook'");
  await pool.query("UPDATE members SET role='admin' WHERE id=$1", [admin.id]);
  admin = { ...admin, role: "admin", onboarded: true };
  member = { ...member, onboarded: true };
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await pool.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

async function service() {
  const { createTranslationService } = await import("../../src/features/translations/service");
  return createTranslationService({ pool });
}
async function recipe() {
  const id = await publishedRecipe(pool, member.id, {
    title: "Rice pudding",
    ingredients: [
      { kind: "section", quantity: "", unit: "", name: "Pudding", notes: "" },
      { kind: "ingredient", quantity: "1 1/2", unit: "cups", name: "rice", notes: "rinsed" },
    ],
    instructions: [{ kind: "step", text: "Simmer slowly." }],
  });
  const version = (await pool.query("SELECT version FROM recipes WHERE id=$1", [id])).rows[0].version as number;
  return { id, version };
}
const spanish = (title = "Arroz con leche") => ({
  title,
  story: "",
  notes: "",
  yieldText: "4 porciones",
  ingredients: [
    { name: "Arroz con leche", notes: "", unit: "" },
    { name: "arroz", notes: "enjuagado", unit: "tazas" },
  ],
  instructions: [{ text: "Hervir a fuego lento." }],
  captions: [],
});
function value<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

test("only admins write translations", async () => {
  const { id, version } = await recipe();
  const svc = await service();
  expect(await svc.saveTranslation(null, id, "es", version, spanish())).toMatchObject({ ok: false, error: { status: 401 } });
  expect(await svc.saveTranslation(member, id, "es", version, spanish())).toMatchObject({ ok: false, error: { status: 403 } });
  // A stale role claim on the actor does not grant access; the database role decides.
  expect(await svc.saveTranslation({ ...member, role: "owner" }, id, "es", version, spanish())).toMatchObject({ ok: false, error: { status: 403 } });
  await pool.query("UPDATE members SET suspended=true WHERE id=$1", [admin.id]);
  expect(await svc.saveTranslation(admin, id, "es", version, spanish())).toMatchObject({ ok: false, error: { status: 403 } });
  await pool.query("UPDATE members SET suspended=false WHERE id=$1", [admin.id]);
  expect(value(await svc.saveTranslation(admin, id, "es", version, spanish())).status).toBe("proposed");
  await pool.query("UPDATE members SET role='owner' WHERE id=$1", [member.id]);
  expect(value(await svc.saveTranslation({ ...member, role: "owner" }, id, "es", version, spanish())).status).toBe("proposed");
  const actions = (await pool.query("SELECT action FROM content_audit ORDER BY created_at")).rows.map((r) => r.action);
  expect(actions).toEqual(["translation_saved", "translation_saved"]);
});

test("structure must match the source", async () => {
  const { id, version } = await recipe();
  const svc = await service();
  const short = { ...spanish(), ingredients: [{ name: "arroz", notes: "", unit: "" }] };
  expect(await svc.saveTranslation(admin, id, "es", version, short)).toMatchObject({ ok: false, error: { status: 400 } });
  expect(await svc.saveTranslation(admin, id, "en", version, spanish())).toMatchObject({ ok: false, error: { status: 400 } });
  expect(await svc.saveTranslation(admin, id, "es", version, { ...spanish(), title: "x".repeat(201) })).toMatchObject({ ok: false, error: { status: 400 } });
});

test("stale approval fails", async () => {
  const { id, version } = await recipe();
  const svc = await service();
  const saved = value(await svc.saveTranslation(admin, id, "es", version, spanish()));
  await pool.query("UPDATE recipes SET version=version+1 WHERE id=$1", [id]);
  const result = value(await svc.approveTranslations(admin, [{ id: saved.id, sourceVersion: version }]));
  expect(result).toEqual({ approved: 0, conflicts: [saved.id] });
  expect(await svc.saveTranslation(admin, id, "es", version, spanish())).toMatchObject({ ok: false, error: { status: 409 } });
});

test("approved translations reach readers and search", async () => {
  const { id, version } = await recipe();
  const svc = await service();
  const saved = value(await svc.saveTranslation(admin, id, "es", version, spanish()));
  expect(await svc.readerTranslation(id, "es")).toBeNull();
  expect(value(await svc.approveTranslations(admin, [{ id: saved.id, sourceVersion: version }]))).toEqual({ approved: 1, conflicts: [] });
  expect((await svc.readerTranslation(id, "es"))?.title).toBe("Arroz con leche");
  const { createCatalogService } = await import("../../src/features/recipes/catalog");
  const page = value(await createCatalogService({ pool }).list({ q: "arroz", language: "es" }, null));
  expect(page.items.map((r) => r.title)).toEqual(["Arroz con leche"]);
});

test("manual corrected text survives proposed revisions", async () => {
  const { id, version } = await recipe();
  const svc = await service();
  const first = value(await svc.saveTranslation(admin, id, "es", version, spanish("Arroz con leche (corregido)")));
  value(await svc.approveTranslations(admin, [{ id: first.id, sourceVersion: version }]));
  value(await svc.saveTranslation(admin, id, "es", version, spanish("Propuesta nueva")));
  expect((await svc.readerTranslation(id, "es"))?.title).toBe("Arroz con leche (corregido)");
  const rows = (await pool.query("SELECT status, input->>'title' AS title FROM recipe_translations WHERE recipe_id=$1 ORDER BY status", [id])).rows;
  expect(rows).toEqual([
    { status: "approved", title: "Arroz con leche (corregido)" },
    { status: "proposed", title: "Propuesta nueva" },
  ]);
});

test("approving a revision replaces the approved text and keeps one approved row", async () => {
  const { id, version } = await recipe();
  const svc = await service();
  const first = value(await svc.saveTranslation(admin, id, "es", version, spanish("Primera")));
  value(await svc.approveTranslations(admin, [{ id: first.id, sourceVersion: version }]));
  const second = value(await svc.saveTranslation(admin, id, "es", version, spanish("Segunda")));
  value(await svc.approveTranslations(admin, [{ id: second.id, sourceVersion: version }]));
  expect((await svc.readerTranslation(id, "es"))?.title).toBe("Segunda");
  expect((await pool.query("SELECT count(*)::int AS n FROM recipe_translations WHERE recipe_id=$1 AND status='approved'", [id])).rows[0].n).toBe(1);
});

test("bulk approval approves only current-version rows", async () => {
  const a = await recipe();
  const b = await recipe();
  const c = await recipe();
  const svc = await service();
  const rows = [
    value(await svc.saveTranslation(admin, a.id, "es", a.version, spanish())),
    value(await svc.saveTranslation(admin, b.id, "es", b.version, spanish())),
    value(await svc.saveTranslation(admin, c.id, "es", c.version, spanish())),
  ];
  await pool.query("UPDATE recipes SET version=version+1 WHERE id=$1", [c.id]);
  const result = value(
    await svc.approveTranslations(admin, [
      { id: rows[0].id, sourceVersion: a.version },
      { id: rows[1].id, sourceVersion: b.version },
      { id: rows[2].id, sourceVersion: c.version },
    ]),
  );
  expect(result).toEqual({ approved: 2, conflicts: [rows[2].id] });
  expect(await svc.approveTranslations(member, [{ id: rows[0].id, sourceVersion: a.version }])).toMatchObject({ ok: false, error: { status: 403 } });
});

test("automation flag off makes zero provider calls", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const { id, version } = await recipe();
  const svc = await service();
  const saved = value(await svc.saveTranslation(admin, id, "es", version, spanish()));
  value(await svc.approveTranslations(admin, [{ id: saved.id, sourceVersion: version }]));
  await svc.readerTranslation(id, "es");
  expect(fetch).not.toHaveBeenCalled();
});

test("pending proposals are listed for bulk approval with their freshness", async () => {
  const a = await recipe();
  const b = await recipe();
  const svc = await service();
  const first = value(await svc.saveTranslation(admin, a.id, "es", a.version, spanish("Uno")));
  const second = value(await svc.saveTranslation(admin, b.id, "es", b.version, spanish("Dos")));
  await pool.query("UPDATE recipes SET version=version+1 WHERE id=$1", [b.id]);
  const rows = value(await svc.listProposals(admin));
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: first.id, recipeId: a.id, title: "Uno", language: "es", sourceVersion: a.version, current: true }),
      expect.objectContaining({ id: second.id, current: false }),
    ]),
  );
  expect(await svc.listProposals(member)).toMatchObject({ ok: false, error: { status: 403 } });
});
