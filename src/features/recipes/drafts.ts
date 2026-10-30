import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "../accounts/service";
import { getPool, transaction } from "../../server/db";
import { disposeUnusedAsset } from "../media/service";
import {
  emptyRecipe,
  isId,
  validateDraft,
  validatePublication,
  type Draft,
  type RecipeInput,
  type Result,
  type FieldError,
  type Origin,
} from "./validation";
export class DraftError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: FieldError[],
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}
async function result<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof DraftError
          ? {
              status: e.status,
              message: e.message,
              fields: e.fields,
              retryAfter: e.retryAfter,
            }
          : {
              status: 503,
              message:
                "Draft service unavailable. Your work is preserved; please retry.",
            },
    };
  }
}
interface Row {
  id: string;
  owner_id: string;
  state: string;
  version: number;
  generation: number;
  input: RecipeInput;
  slug: string | null;
  updated_at: Date;
  first_published_at: Date | null;
  last_saved_at: Date | null;
}
const dto = (r: Row): Draft => ({
  id: r.id,
  version: r.version,
  generation: r.generation,
  input: r.input,
  label: r.input.title.trim() || "Untitled recipe",
  state: r.state,
  url: r.slug ? `/recipes/${r.id}/${r.slug}` : null,
  updatedAt: r.updated_at.toISOString(),
  publishedAt: r.first_published_at?.toISOString() ?? null,
});
const slug = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "recipe";
export function createDraftService(options: {
  pool: Pool;
  disposeUnusedAsset: (id: string) => Promise<void>;
}) {
  const { pool } = options;
  async function authorize(
    client: PoolClient,
    actor: Actor | null,
    write = true,
  ) {
    if (!actor || !isId(actor.id))
      throw new DraftError(401, "Sign-in required.");
    const member = (
      await client.query(
        "SELECT id,suspended,onboarded_at,draft_generation FROM members WHERE id=$1 FOR UPDATE",
        [actor.id],
      )
    ).rows[0];
    if (!member) throw new DraftError(401, "Sign-in required.");
    if (write && (member.suspended || !member.onboarded_at))
      throw new DraftError(
        403,
        "Contributions are currently unavailable for this account.",
      );
    return member;
  }
  async function owned(
    client: PoolClient,
    actor: Actor | null,
    id: string,
    write = true,
  ) {
    const member = await authorize(client, actor, write);
    if (!isId(id)) throw new DraftError(404, "Draft not found.");
    const r = (
      await client.query<Row>("SELECT * FROM recipes WHERE id=$1 FOR UPDATE", [
        id,
      ])
    ).rows[0];
    if (!r || r.owner_id !== actor!.id)
      throw new DraftError(404, "Draft not found.");
    if (
      r.state === "deleted" ||
      r.generation !== member.draft_generation ||
      (
        await client.query("SELECT 1 FROM draft_tombstones WHERE draft_id=$1", [
          id,
        ])
      ).rowCount
    )
      throw new DraftError(
        410,
        "This draft was deleted or reset. Discard its device copy.",
      );
    if (write && r.state !== "draft")
      throw new DraftError(409, "This recipe is no longer an editable draft.");
    return r;
  }
  function version(r: Row, expected: number) {
    if (!Number.isSafeInteger(expected) || r.version !== expected)
      throw new DraftError(
        409,
        "A newer version exists. Load latest or save your work as a separate draft.",
      );
  }
  async function validate(client: PoolClient, input: unknown, publish = false) {
    const fields = (publish ? validatePublication : validateDraft)(input);
    if (fields.length)
      throw new DraftError(422, "Check the highlighted fields.", fields);
    const v = input as RecipeInput;
    if (
      v.origin &&
      !(
        await client.query(
          "SELECT 1 FROM recipe_origins WHERE id=$1 AND active",
          [v.origin],
        )
      ).rowCount
    )
      throw new DraftError(422, "Choose an available origin.", [
        { field: "origin", step: 0, message: "Choose an available origin." },
      ]);
    return structuredClone(v);
  }
  async function attach(
    client: PoolClient,
    actor: Actor,
    id: string,
    input: RecipeInput,
  ) {
    const old = (
      await client.query<{ asset_id: string }>(
        "SELECT asset_id FROM media_references WHERE kind='recipe' AND reference_id=$1",
        [id],
      )
    ).rows.map((r) => r.asset_id);
    for (const assetId of [
      ...new Set([...old, ...input.photos.map((p) => p.assetId)]),
    ].sort()) {
      const a = (
        await client.query(
          "SELECT owner_id,purpose,state,width,height FROM media_assets WHERE id=$1 FOR UPDATE",
          [assetId],
        )
      ).rows[0];
      if (
        input.photos.some((p) => p.assetId === assetId) &&
        (!a ||
          a.owner_id !== actor.id ||
          a.purpose !== "recipe" ||
          a.state !== "ready")
      )
        throw new DraftError(
          403,
          "Use your own verified, available recipe photos.",
        );
      for (const photo of input.photos.filter((p) => p.assetId === assetId)) {
        photo.width = a.width;
        photo.height = a.height;
      }
    }
    await client.query(
      "DELETE FROM media_references WHERE kind='recipe' AND reference_id=$1",
      [id],
    );
    for (const p of input.photos)
      await client.query(
        "INSERT INTO media_references(asset_id,kind,reference_id) VALUES($1,'recipe',$2)",
        [p.assetId, id],
      );
    return old.filter((id) => !input.photos.some((p) => p.assetId === id));
  }
  async function cleanup(ids: string[]) {
    for (const id of ids) {
      try {
        await options.disposeUnusedAsset(id);
      } catch {
        /* Durable media cleanup retries after commit. */
      }
    }
  }
  async function insert(client: PoolClient, actor: Actor, input: RecipeInput) {
    const member = await authorize(client, actor);
    const id = randomUUID();
    await attach(client, actor, id, input);
    const r = (
      await client.query<Row>(
        "INSERT INTO recipes(id,owner_id,generation,input) VALUES($1,$2,$3,$4) RETURNING *",
        [id, actor.id, member.draft_generation, JSON.stringify(input)],
      )
    ).rows[0];
    return dto(r);
  }
  const api = {
    createDraft: (actor: Actor | null, input?: unknown) =>
      result(() =>
        transaction(pool, async (client) => {
          await authorize(client, actor);
          const v =
            input === undefined ? emptyRecipe() : await validate(client, input);
          return insert(client, actor!, v);
        }),
      ),
    readDraft: (actor: Actor | null, id: string) =>
      result(() =>
        transaction(pool, async (client) =>
          dto(await owned(client, actor, id, false)),
        ),
      ),
    listDrafts: (actor: Actor | null) =>
      result(() =>
        transaction(pool, async (client) => {
          await authorize(client, actor, false);
          return (
            await client.query<Row>(
              "SELECT * FROM recipes WHERE owner_id=$1 AND state='draft' ORDER BY updated_at DESC,id LIMIT 100",
              [actor!.id],
            )
          ).rows.map(dto);
        }),
      ),
    listPublished: (actor: Actor | null) =>
      result(() =>
        transaction(pool, async (client) => {
          await authorize(client, actor, false);
          return (
            await client.query<Row>(
              "SELECT * FROM recipes WHERE owner_id=$1 AND state='published' ORDER BY first_published_at DESC,id LIMIT 100",
              [actor!.id],
            )
          ).rows.map(dto);
        }),
      ),
    async saveDraft(
      actor: Actor | null,
      id: string,
      expectedVersion: number,
      input: unknown,
    ): Promise<Result<Draft>> {
      return result(async () => {
        const change = await transaction(pool, async (client) => {
          const r = await owned(client, actor, id);
          version(r, expectedVersion);
          const v = await validate(client, input);
          if (
            JSON.stringify(r.input) ===
            JSON.stringify(JSON.parse(JSON.stringify(v)))
          )
            return { draft: dto(r), removed: [] as string[] };
          // jsonb key order differs from JS insertion order: database equality handles unchanged retries.
          if (
            (
              await client.query(
                "SELECT input=$2::jsonb AS same FROM recipes WHERE id=$1",
                [id, JSON.stringify(v)],
              )
            ).rows[0].same
          )
            return { draft: dto(r), removed: [] as string[] };
          const elapsed = Date.now() - (r.last_saved_at?.getTime() ?? 0);
          if (elapsed < 5000)
            throw new DraftError(
              429,
              "Please wait before saving again. Your work is preserved.",
              undefined,
              Math.max(1, Math.ceil((5000 - elapsed) / 1000)),
            );
          const removed = await attach(client, actor!, id, v);
          const next = (
            await client.query<Row>(
              "UPDATE recipes SET input=$2,version=version+1,updated_at=now(),last_saved_at=now() WHERE id=$1 RETURNING *",
              [id, JSON.stringify(v)],
            )
          ).rows[0];
          return { draft: dto(next), removed };
        });
        await cleanup(change.removed);
        return change.draft;
      });
    },
    copyDraft: (
      actor: Actor | null,
      id: string,
      generation: number,
      input: unknown,
    ) =>
      result(() =>
        transaction(pool, async (client) => {
          const r = await owned(client, actor, id);
          if (r.generation !== generation)
            throw new DraftError(410, "This draft was reset.");
          const v = await validate(client, input);
          return insert(client, actor!, v);
        }),
      ),
    deleteDraft: (actor: Actor | null, id: string, expectedVersion: number) =>
      result(async () => {
        const removed = await transaction(pool, async (client) => {
          const r = await owned(client, actor, id);
          version(r, expectedVersion);
          await client.query(
            "INSERT INTO draft_tombstones(draft_id,owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [id, actor!.id],
          );
          await client.query(
            "UPDATE recipes SET state='deleted',deleted_at=now(),version=version+1 WHERE id=$1",
            [id],
          );
          const assets = (
            await client.query<{ asset_id: string }>(
              "DELETE FROM media_references WHERE kind='recipe' AND reference_id=$1 RETURNING asset_id",
              [id],
            )
          ).rows;
          return assets.map((a) => a.asset_id);
        });
        await cleanup(removed);
        return { deleted: true };
      }),
    // Account lifecycle calls this inside its own transaction after permission checks;
    // it must dispose returned assets after commit. Never perform provider I/O here.
    async resetDraftsInTransaction(
      client: PoolClient,
      memberId: string,
    ): Promise<string[]> {
      await client.query("SELECT id FROM members WHERE id=$1 FOR UPDATE", [
        memberId,
      ]);
      const drafts = (
        await client.query<{ id: string }>(
          "SELECT id FROM recipes WHERE owner_id=$1 AND state='draft' FOR UPDATE",
          [memberId],
        )
      ).rows;
      await client.query(
        "UPDATE members SET draft_generation=draft_generation+1 WHERE id=$1",
        [memberId],
      );
      const assets: string[] = [];
      for (const d of drafts) {
        await client.query(
          "INSERT INTO draft_tombstones(draft_id,owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [d.id, memberId],
        );
        await client.query(
          "UPDATE recipes SET state='deleted',deleted_at=now(),version=version+1 WHERE id=$1",
          [d.id],
        );
        assets.push(
          ...(
            await client.query<{ asset_id: string }>(
              "DELETE FROM media_references WHERE kind='recipe' AND reference_id=$1 RETURNING asset_id",
              [d.id],
            )
          ).rows.map((r) => r.asset_id),
        );
      }
      return [...new Set(assets)];
    },
    publishRecipe: (actor: Actor | null, id: string, expectedVersion: number) =>
      result(() =>
        transaction(pool, async (client) => {
          const r = await owned(client, actor, id);
          version(r, expectedVersion);
          await validate(client, r.input, true);
          await attach(client, actor!, id, r.input);
          const counts = (
            await client.query(
              "SELECT count(*) FILTER(WHERE published_at>now()-interval '1 hour')::int AS hourly,count(*)::int AS daily FROM recipe_publications WHERE owner_id=$1 AND published_at>now()-interval '1 day'",
              [actor!.id],
            )
          ).rows[0];
          if (counts.hourly >= 5 || counts.daily >= 20)
            throw new DraftError(
              429,
              "Publication limit reached. Your draft is saved.",
              undefined,
              counts.daily >= 20 ? 86400 : 3600,
            );
          await client.query(
            "INSERT INTO recipe_publications(recipe_id,owner_id) VALUES($1,$2)",
            [id, actor!.id],
          );
          return dto(
            (
              await client.query<Row>(
                "UPDATE recipes SET state='published',slug=$2,first_published_at=COALESCE(first_published_at,now()),version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
                [id, r.slug ?? slug(r.input.title)],
              )
            ).rows[0],
          );
        }),
      ),
    readPublished: (id: string) =>
      result(async () => {
        if (!isId(id)) throw new DraftError(404, "Recipe unavailable.");
        const r = (
          await pool.query<Row>(
            "SELECT * FROM recipes WHERE id=$1 AND state='published'",
            [id],
          )
        ).rows[0];
        if (!r) throw new DraftError(404, "Recipe unavailable.");
        return dto(r);
      }),
    origins: async (): Promise<Origin[]> =>
      (
        await pool.query<Origin>(
          "SELECT id,label_en,label_es FROM recipe_origins WHERE active ORDER BY label_en",
        )
      ).rows,
    similarTitles: async (
      title: string,
    ): Promise<{ id: string; title: string; url: string }[]> => {
      if (title.trim().length < 3) return [];
      return (
        await pool.query<Row>(
          "SELECT * FROM recipes WHERE state='published' AND strpos(lower(input->>'title'),lower($1))>0 ORDER BY first_published_at DESC,id LIMIT 5",
          [title.trim().slice(0, 200)],
        )
      ).rows.map((r) => ({
        id: r.id,
        title: r.input.title,
        url: `/recipes/${r.id}/${r.slug}`,
      }));
    },
  };
  return api;
}
export const draftsService = () =>
  createDraftService({ pool: getPool(), disposeUnusedAsset });
export const saveDraft = (
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: unknown,
) => draftsService().saveDraft(actor, id, expectedVersion, input);
export const publishRecipe = (
  actor: Actor,
  id: string,
  expectedVersion: number,
) => draftsService().publishRecipe(actor, id, expectedVersion);
export { validatePublication } from "./validation";
