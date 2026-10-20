import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, expect, test } from "vitest";
import { migrate } from "../../src/server/db";
import {
  createAccountService,
  type Actor,
} from "../../src/features/accounts/service";

const url = process.env.TEST_DATABASE_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Requires local PostgreSQL");
const schema = `drafts_${randomUUID().replaceAll("-", "")}`;
const root = new Pool({ connectionString: url });
const pool = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
let actor: Actor;
let other: Actor;
beforeAll(async () => {
  await root.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query("TRUNCATE members CASCADE");
  const accounts = createAccountService({
    pool,
    origin: "https://recipes.example",
    verifyIdentity: async () => null,
  });
  actor = await accounts.ensureMember({
    provider: "clerk",
    subject: "author",
    email: "a@example.com",
    emailVerified: true,
  });
  other = await accounts.ensureMember({
    provider: "clerk",
    subject: "other",
    email: "b@example.com",
    emailVerified: true,
  });
  await pool.query("UPDATE members SET onboarded_at=now()");
});
afterAll(async () => {
  await pool.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
});

test("draft service provides immediate incomplete drafts rather than requiring publication fields", async () => {
  const module = await import("../../src/features/recipes/drafts").catch(
    () => null,
  );
  expect(
    module?.createDraftService,
    "versioned draft service is missing",
  ).toBeTypeOf("function");
  if (!module) return;
  const service = module.createDraftService({
    pool,
    disposeUnusedAsset: async () => {},
  });
  const draft = await service.createDraft(actor);
  expect(draft).toMatchObject({
    ok: true,
    value: { version: 1, input: { title: "" }, label: "Untitled recipe" },
  });
});

async function setup() {
  const { createDraftService } =
    await import("../../src/features/recipes/drafts");
  return createDraftService({
    pool,
    disposeUnusedAsset: async (id: string) => {
      cleaned.push(id);
    },
  });
}
const cleaned: string[] = [];
function value<T>(
  r: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!r.ok) throw r.error;
  return r.value;
}
async function readyAsset(owner = actor) {
  const intent = randomUUID(),
    id = randomUUID();
  await pool.query(
    "INSERT INTO upload_intents(id,owner_id,purpose,input_mime,input_size,provider_path,expires_at,completed_at) VALUES($1,$2,'recipe','image/jpeg',1,$3,now(),now())",
    [intent, owner.id, `/${intent}`],
  );
  await pool.query(
    "INSERT INTO media_assets(id,intent_id,owner_id,purpose,provider_file_id,provider_path,stored_bytes,width,height) VALUES($1,$2,$3,'recipe',$4,$4,100,640,480)",
    [id, intent, owner.id, `/${intent}`],
  );
  return {
    assetId: id,
    width: 640,
    height: 480,
    caption: "Author supplied caption",
    alt: "",
    crop: { x: 50, y: 50, zoom: 1 },
  };
}
async function completeInput() {
  const { emptyRecipe } = await import("../../src/features/recipes/validation");
  return {
    ...emptyRecipe(),
    title: "Test author recipe",
    category: "main",
    origin: "not-sure",
    yieldText: "4–6 servings",
    baseline: 4,
    baselineConfirmed: true,
    timing: {
      mode: "total" as const,
      total: 30,
      prep: null,
      cook: null,
      rest: null,
    },
    photos: [await readyAsset()],
    ingredients: [
      {
        kind: "ingredient" as const,
        quantity: "½–1",
        unit: "cup",
        name: "beans",
        notes: "to taste",
      },
    ],
    instructions: [{ kind: "step" as const, text: "Cook carefully." }],
  };
}
async function allowSave(id: string) {
  await pool.query(
    "UPDATE recipes SET last_saved_at=now()-interval '6 seconds' WHERE id=$1",
    [id],
  );
}

test("versions never overwrite: concurrent save, unchanged retry, load latest and separate copy retain owned media", async () => {
  const svc = await setup(),
    draft = value(await svc.createDraft(actor)),
    input = await completeInput();
  const saved = value(await svc.saveDraft(actor, draft.id, 1, input));
  expect(saved.version).toBe(2);
  expect(
    await svc.saveDraft(actor, draft.id, 1, { ...input, title: "stale" }),
  ).toMatchObject({ ok: false, error: { status: 409 } });
  expect(value(await svc.readDraft(actor, draft.id)).input.title).toBe(
    "Test author recipe",
  );
  expect(value(await svc.saveDraft(actor, draft.id, 2, input)).version).toBe(2);
  expect(
    await svc.saveDraft(actor, draft.id, 2, { ...input, title: "new" }),
  ).toMatchObject({
    ok: false,
    error: { status: 429, retryAfter: expect.any(Number) },
  });
  const copy = value(
    await svc.copyDraft(actor, draft.id, 1, {
      ...input,
      title: "My separate copy",
    }),
  );
  expect(copy.id).not.toBe(draft.id);
  expect(copy.input.photos).toEqual(input.photos);
  expect(
    (
      await pool.query("SELECT * FROM media_references WHERE asset_id=$1", [
        input.photos[0].assetId,
      ])
    ).rowCount,
  ).toBe(2);
  await allowSave(draft.id);
  const concurrent = await Promise.all([
    svc.saveDraft(actor, draft.id, 2, { ...input, title: "One" }),
    svc.saveDraft(actor, draft.id, 2, { ...input, title: "Two" }),
  ]);
  expect(concurrent.filter((r) => r.ok)).toHaveLength(1);
  expect(concurrent.find((r) => !r.ok)).toMatchObject({
    error: { status: 409 },
  });
});
test("fresh permissions, ownership, ready assets and atomic reference replacement are enforced", async () => {
  const svc = await setup(),
    draft = value(await svc.createDraft(actor)),
    input = await completeInput();
  for (const who of [null, other])
    expect(await svc.saveDraft(who, draft.id, 1, input)).toMatchObject({
      ok: false,
    });
  for (const role of ["admin", "owner"]) {
    await pool.query("UPDATE members SET role=$2 WHERE id=$1", [
      other.id,
      role,
    ]);
    expect(
      await svc.readDraft({ ...other, role: "member" }, draft.id),
    ).toMatchObject({ ok: false });
  }
  const saved = value(await svc.saveDraft(actor, draft.id, 1, input));
  await allowSave(draft.id);
  expect(
    await svc.saveDraft(actor, draft.id, saved.version, {
      ...input,
      photos: [await readyAsset(other)],
    }),
  ).toMatchObject({ ok: false, error: { status: 403 } });
  expect(value(await svc.readDraft(actor, draft.id)).input.photos).toEqual(
    input.photos,
  );
  await pool.query("UPDATE members SET suspended=true WHERE id=$1", [actor.id]);
  expect(
    await svc.publishRecipe({ ...actor, suspended: false }, draft.id, 2),
  ).toMatchObject({ ok: false, error: { status: 403 } });
  await pool.query(
    "UPDATE members SET suspended=false,onboarded_at=NULL WHERE id=$1",
    [actor.id],
  );
  expect(await svc.saveDraft(actor, draft.id, 2, input)).toMatchObject({
    ok: false,
    error: { status: 403 },
  });
  await pool.query("UPDATE members SET onboarded_at=now() WHERE id=$1", [
    actor.id,
  ]);
  cleaned.length = 0;
  expect(
    await svc.saveDraft(actor, draft.id, 2, { ...input, photos: [] }),
  ).toMatchObject({ ok: true });
  expect(cleaned).toEqual([input.photos[0].assetId]);
});
test("deletion and account reset tombstones prevent stale recovery/copy without expiring saved drafts", async () => {
  const svc = await setup(),
    draft = value(await svc.createDraft(actor));
  const second = value(await svc.createDraft(actor));
  await pool.query(
    "UPDATE recipes SET created_at=now()-interval '2 years' WHERE id=$1",
    [draft.id],
  );
  expect(await svc.readDraft(actor, draft.id)).toMatchObject({ ok: true });
  expect(await svc.deleteDraft(actor, draft.id, 1)).toMatchObject({ ok: true });
  expect(await svc.readDraft(actor, draft.id)).toMatchObject({
    ok: false,
    error: { status: 410 },
  });
  expect(
    await svc.copyDraft(
      actor,
      draft.id,
      1,
      (await import("../../src/features/recipes/validation")).emptyRecipe(),
    ),
  ).toMatchObject({ ok: false, error: { status: 410 } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await svc.resetDraftsInTransaction(client, actor.id);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  expect(
    await svc.saveDraft(
      actor,
      second.id,
      1,
      (await import("../../src/features/recipes/validation")).emptyRecipe(),
    ),
  ).toMatchObject({ ok: false, error: { status: 410 } });
});
test("publication validates required fields, limits, schemes and exact text; public contract cannot expose drafts", async () => {
  const svc = await setup(),
    draft = value(await svc.createDraft(actor));
  expect(await svc.readPublished(draft.id)).toMatchObject({
    ok: false,
    error: { status: 404 },
  });
  expect(await svc.publishRecipe(actor, draft.id, 1)).toMatchObject({
    ok: false,
    error: {
      status: 422,
      fields: expect.arrayContaining([
        expect.objectContaining({ field: "title" }),
        expect.objectContaining({ field: "photos" }),
      ]),
    },
  });
  const input = await completeInput();
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "//evil.example",
    "https://name:password@example.com",
  ]) {
    expect(
      await svc.saveDraft(actor, draft.id, 1, { ...input, videoUrl: url }),
    ).toMatchObject({ ok: false, error: { status: 422 } });
  }
  for (const change of [
    { photos: [] },
    { photos: Array(7).fill(input.photos[0]) },
    { photos: [{ ...input.photos[0], caption: "x".repeat(401) }] },
    { ingredients: Array(101).fill(input.ingredients[0]) },
    { instructions: Array(51).fill(input.instructions[0]) },
    { baselineConfirmed: false },
  ]) {
    const { validatePublication } =
      await import("../../src/features/recipes/validation");
    expect(validatePublication({ ...input, ...change })).not.toEqual([]);
  }
  const text = '<script>alert("x")</script> Frijoles ½';
  const saved = value(
    await svc.saveDraft(actor, draft.id, 1, {
      ...input,
      title: text,
      videoUrl: "https://example.com/watch?v=1",
    }),
  );
  const published = value(
    await svc.publishRecipe(actor, draft.id, saved.version),
  );
  expect(published.url).toMatch(new RegExp(`^/recipes/${draft.id}/`));
  expect(value(await svc.readPublished(draft.id)).input.title).toBe(text);
  expect(
    value(await svc.readPublished(draft.id)).input.ingredients[0].quantity,
  ).toBe("½–1");
  // The profile lists the owner's published recipes apart from their drafts.
  expect(value(await svc.listPublished(actor)).map((r) => r.id)).toContain(
    draft.id,
  );
  expect(value(await svc.listDrafts(actor)).map((r) => r.id)).not.toContain(
    draft.id,
  );
  expect(await svc.listPublished(null)).toMatchObject({
    ok: false,
    error: { status: 401 },
  });
  await pool.query("UPDATE recipes SET state='hidden' WHERE id=$1", [draft.id]);
  expect(await svc.readPublished(draft.id)).toMatchObject({
    ok: false,
    error: { status: 404 },
  });
  expect(value(await svc.listPublished(actor)).map((r) => r.id)).not.toContain(
    draft.id,
  );
});
test("draft HTTP boundary preserves auth/CSRF/no-store and rejects client role and oversized bodies", async () => {
  const { handleDraftRequest } =
    await import("../../src/features/recipes/routes");
  const accounts = createAccountService({
    pool,
    origin: "https://recipes.example",
    verifyIdentity: async (req) =>
      req.headers.get("Authorization") === "fixture"
        ? {
            provider: "clerk",
            subject: "author",
            email: "a@example.com",
            emailVerified: true,
          }
        : null,
  });
  const deps = {
    accounts,
    drafts: await setup(),
    origin: "https://recipes.example",
  };
  const request = (
    body: unknown,
    origin = "https://recipes.example",
    auth = "fixture",
  ) =>
    new Request("https://recipes.example/api/drafts", {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  for (const [req, status] of [
    [request({}, "https://evil.example"), 403],
    [request({}, "https://recipes.example", ""), 401],
    [request({ role: "owner" }), 400],
    [request({ text: "x".repeat(300001) }), 413],
  ] as const) {
    const res = await handleDraftRequest(req, undefined, deps);
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  }
  const created = await handleDraftRequest(request({}), undefined, deps);
  expect(created.status).toBe(200);
});
test("verified dimensions override client photo claims and publication quotas are durable", async () => {
  const svc = await setup(),
    draft = value(await svc.createDraft(actor)),
    input = await completeInput();
  const saved = value(
    await svc.saveDraft(actor, draft.id, 1, {
      ...input,
      photos: [{ ...input.photos[0], width: 1, height: 1 }],
    }),
  );
  expect(saved.input.photos[0]).toMatchObject({ width: 640, height: 480 });
  await pool.query(
    "INSERT INTO recipe_publications(recipe_id,owner_id,published_at) SELECT $1,$2,now() FROM generate_series(1,5)",
    [draft.id, actor.id],
  );
  expect(await svc.publishRecipe(actor, draft.id, saved.version)).toMatchObject(
    { ok: false, error: { status: 429 } },
  );
  expect(value(await svc.readDraft(actor, draft.id)).state).toBe("draft");
  await pool.query("DELETE FROM recipe_publications");
  await pool.query(
    "INSERT INTO recipe_publications(recipe_id,owner_id,published_at) SELECT $1,$2,now()-interval '2 hours' FROM generate_series(1,20)",
    [draft.id, actor.id],
  );
  expect(await svc.publishRecipe(actor, draft.id, saved.version)).toMatchObject(
    { ok: false, error: { status: 429 } },
  );
});

test("separate-copy creation normalizes dimensions before persisting", async () => {
  const svc = await setup(),
    draft = value(await svc.createDraft(actor)),
    input = await completeInput();
  const copy = value(
    await svc.copyDraft(actor, draft.id, 1, {
      ...input,
      photos: [{ ...input.photos[0], width: 1, height: 1 }],
    }),
  );
  expect(copy.input.photos[0]).toMatchObject({ width: 640, height: 480 });
  expect(
    value(await svc.readDraft(actor, copy.id)).input.photos[0],
  ).toMatchObject({ width: 640, height: 480 });
});

test("createDraft stores provided initial input in one request", async () => {
  const { emptyRecipe } = await import("../../src/features/recipes/validation");
  const svc = await setup();
  const draft = value(
    await svc.createDraft(actor, {
      ...emptyRecipe(),
      title: "Abuela's tamales",
    }),
  );
  expect(draft.version).toBe(1);
  expect(draft.input.title).toBe("Abuela's tamales");
  expect(draft.label).toBe("Abuela's tamales");
  const rows = await pool.query(
    "SELECT count(*)::int AS n FROM recipes WHERE owner_id=$1",
    [actor.id],
  );
  expect(rows.rows[0].n).toBe(1);
});

test("createDraft rejects invalid initial input without creating a row", async () => {
  const { emptyRecipe } = await import("../../src/features/recipes/validation");
  const svc = await setup();
  const result = await svc.createDraft(actor, {
    ...emptyRecipe(),
    title: "x".repeat(201),
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.status).toBe(422);
  const rows = await pool.query(
    "SELECT count(*)::int AS n FROM recipes WHERE owner_id=$1",
    [actor.id],
  );
  expect(rows.rows[0].n).toBe(0);
});
