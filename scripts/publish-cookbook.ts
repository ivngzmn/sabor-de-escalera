import type { Actor } from '../src/features/accounts/service.ts';
import { createCookbookCorrections } from '../src/features/cookbook/corrections.ts';
import { createCookbookQueue, needsSourceClearance } from '../src/features/cookbook/queue.ts';
import { validatePublication, type RecipeInput } from '../src/features/recipes/validation.ts';
import { getPool } from '../src/server/db.ts';
import { clearanceFor, fillInput } from './cookbook-publish-values.ts';

// Publishes the staged book drafts through the admin services. Dry run unless --apply.
const apply = process.argv.includes('--apply');
const REASON = 'Fill in book details for publishing';
const pool = getPool();

interface Draft {
  id: string;
  recipe_id: string;
  import_key: string;
  flags: string[];
  source_urls: string[];
  input: RecipeInput;
}

const skipped: string[] = [];
let published = 0;

async function version(recipeId: string) {
  return (await pool.query<{ version: number }>('SELECT version FROM recipes WHERE id=$1', [recipeId])).rows[0].version;
}

function dryRun(d: Draft) {
  const title = d.input.title;
  const { input, missing } = fillInput(d.import_key, d.input);
  const reasons = [...missing];
  for (const f of validatePublication(input)) reasons.push(f.field.split('.')[0]);
  if (needsSourceClearance(d.flags) && !clearanceFor(d.source_urls)) reasons.push('source clearance');
  const unique = [...new Set(reasons)];
  if (unique.length) {
    console.log(`WOULD SKIP ${title}: ${unique.join(', ')}`);
    skipped.push(title);
  } else {
    console.log(`WOULD PUBLISH ${title} (origin=${input.origin}, baseline=${input.baseline}, total=${input.timing.total ?? 'parts'})`);
    published += 1;
  }
}

async function publish(d: Draft, actor: Actor) {
  const corrections = createCookbookCorrections({ pool });
  const queue = createCookbookQueue({ pool });
  const title = d.input.title;
  const fail = (message: string) => {
    console.log(`SKIP ${title}: ${message}`);
    skipped.push(title);
  };

  const { input, missing } = fillInput(d.import_key, d.input);
  if (missing.length) return fail(`missing ${missing.join(', ')}`);

  const corrected = await corrections.correctEntry(actor, d.id, { version: await version(d.recipe_id), input, reason: REASON });
  if (!corrected.ok && corrected.error.message !== 'There are no changes to save.') return fail(corrected.error.message);

  if (needsSourceClearance(d.flags)) {
    const note = clearanceFor(d.source_urls);
    if (!note) return fail('source clearance note missing');
    const cleared = await corrections.clearSource(actor, d.id, { version: await version(d.recipe_id), note });
    if (!cleared.ok) return fail(cleared.error.message);
  }

  const text = await queue.markTextReviewed(actor, d.id, await version(d.recipe_id));
  if (!text.ok) return fail(text.error.message);

  const images = await corrections.markImagesReviewed(actor, d.id, await version(d.recipe_id));
  if (!images.ok) return fail(images.error.message);

  const done = await queue.publishImported(actor, d.id);
  if (!done.ok) return fail(done.error.message);
  console.log(`PUBLISHED ${title}`);
  published += 1;
}

try {
  const owner = (await pool.query<{ id: string }>("SELECT id FROM members WHERE role='owner' LIMIT 1")).rows[0];
  if (!owner) throw new Error('No owner account exists yet.');
  const actor = { id: owner.id, role: 'owner', onboarded: true } as Actor;
  const drafts = (
    await pool.query<Draft>(
      `SELECT e.id,e.recipe_id,e.import_key,e.flags,e.source_urls,r.input
       FROM cookbook_entries e JOIN recipes r ON r.id=e.recipe_id
       WHERE r.state='draft' AND e.import_key NOT LIKE 'example-%'
       ORDER BY e.book_pages[1], e.import_key`,
    )
  ).rows;
  for (const d of drafts) await (apply ? publish(d, actor) : Promise.resolve(dryRun(d)));
  console.log(`\n${apply ? 'Published' : 'Would publish'} ${published} of ${drafts.length}; skipped ${skipped.length}${apply ? '' : ' (dry run, nothing written; pass --apply to publish)'}.`);
  if (skipped.length) console.log(`Still drafts: ${skipped.join('; ')}`);
} finally {
  await pool.end();
}
